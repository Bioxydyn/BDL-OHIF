import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import classnames from 'classnames';
import { useNavigate } from 'react-router-dom';
import { DicomMetadataStore, MODULE_TYPES } from '@ohif/core';

import Dropzone from 'react-dropzone';
import filesToStudies from './filesToStudies';

import { extensionManager } from '../../App.tsx';
import useSearchParams from '../../hooks/useSearchParams.ts';

import { Icon, Button, LoadingIndicatorProgress } from '@ohif/ui';
import { Unzip, unzipSync } from 'fflate';

const hudId = 'ohif-local-download-hud';

const formatBytes = (value: number) => {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log10(Math.max(value, 1)) / 3));
  return `${(value / 1024 ** idx).toFixed(idx ? 1 : 0)} ${units[idx]}`;
};

const formatEta = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 'N/A';
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins ? `${mins}m ` : ''}${secs}s`;
};

const ensureHud = () => {
  let el = document.getElementById(hudId);
  if (!el) {
    el = document.createElement('div');
    el.id = hudId;
    el.style.cssText = [
      'position:fixed',
      'left:12px',
      'top:12px',
      'z-index:9999',
      'padding:10px 12px',
      'border-radius:10px',
      'min-width:220px',
      'background:rgba(15,15,18,0.9)',
      'color:#fff',
      'font:12px/1.35 ui-monospace, Menlo, Monaco, Consolas, monospace',
      'box-shadow:0 6px 16px rgba(0,0,0,0.35)',
      'border:1px solid rgba(255,255,255,0.12)',
      'backdrop-filter:saturate(1.2) blur(2px)',
      '-webkit-font-smoothing:antialiased',
      'pointer-events:none',
      'user-select:none',
      'white-space:pre',
    ].join(';');
    document.body.appendChild(el);
  }

  const destroy = () => el?.remove();
  const update = (lines: string[]) => {
    if (el) {
      el.innerHTML = lines.join('\n');
    }
  };

  return { update, destroy };
};

const sanitizeEntryName = (name: string) =>
  name.replace(/^[/\\]+/, '').replace(/[\\/]+/g, '__') || 'study';

async function downloadAndExtractZip(
  url: string,
  handlers: {
    onFile: (file: File) => void;
    onProgress?: (received: number, total: number) => void;
    signal?: AbortSignal;
  }
) {
  const { onFile, onProgress, signal } = handlers;
  const isAwsSigned = /[?&]X-Amz-/.test(url);
  const response = await fetch(url, {
    method: 'GET',
    mode: 'cors',
    credentials: isAwsSigned ? 'omit' : 'include',
    redirect: 'follow',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const total = Number(response.headers.get('Content-Length')) || 0;

  // Fallback for environments without readable streams.
  if (!response.body?.getReader) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    onProgress?.(buffer.byteLength, total || buffer.byteLength);
    const entries = unzipSync(buffer);
    Object.entries(entries).forEach(([entryName, data]) => {
      if (entryName.endsWith('/') || entryName.startsWith('__MACOSX/')) {
        return;
      }
      const file = new File([data], sanitizeEntryName(entryName), {
        type: 'application/dicom',
        lastModified: Date.now(),
      });
      onFile(file);
    });
    return;
  }

  const reader = response.body.getReader();
  const pending: Promise<void>[] = [];
  let unzipError: Error | undefined;
  let received = 0;

  const unzipper = new Unzip((err, file) => {
    if (err) {
      unzipError = err;
      return;
    }

    if (!file || file.name.endsWith('/') || file.name.startsWith('__MACOSX/')) {
      file?.start?.();
      return;
    }

    const entryPromise = new Promise<void>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      file.ondata = (dataErr, data, final) => {
        if (dataErr) {
          reject(dataErr);
          return;
        }

        if (data) {
          chunks.push(data);
        }

        if (final) {
          try {
            const fileBlob = new Blob(chunks, { type: 'application/dicom' });
            const zippedFile = new File([fileBlob], sanitizeEntryName(file.name), {
              type: 'application/dicom',
              lastModified: Date.now(),
            });
            onFile(zippedFile);
            resolve();
          } catch (creationErr) {
            reject(creationErr);
          }
        }
      };
    });

    pending.push(entryPromise);
    file.start();
  });

  // Stream bytes into the unzipper.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (value?.byteLength) {
      received += value.byteLength;
      onProgress?.(received, total);
      unzipper.push(value, false);
    }
    if (done) {
      unzipper.push(new Uint8Array(0), true);
      break;
    }
  }

  await Promise.all(pending);

  if (unzipError) {
    throw unzipError;
  }
}

const getLoadButton = (onDrop, text, isDir) => {
  return (
    <Dropzone
      onDrop={onDrop}
      noDrag
    >
      {({ getRootProps, getInputProps }) => (
        <div {...getRootProps()}>
          <Button
            rounded="full"
            variant="contained" // outlined
            disabled={false}
            endIcon={<Icon name="launch-arrow" />} // launch-arrow | launch-info
            className={classnames('font-medium', 'ml-2')}
            onClick={() => {}}
          >
            {text}
            {isDir ? (
              <input
                {...({
                  ...getInputProps(),
                  // Non-standard attributes are required for directory selection.
                  webkitdirectory: 'true',
                  mozdirectory: 'true',
                } as React.InputHTMLAttributes<HTMLInputElement>)}
              />
            ) : (
              <input {...getInputProps()} />
            )}
          </Button>
        </div>
      )}
    </Dropzone>
  );
};

type LocalProps = {
  modePath: string;
};

function Local({ modePath }: LocalProps) {
  const navigate = useNavigate();
  const dropzoneRef = useRef();
  const [dropInitiated, setDropInitiated] = React.useState(false);
  const lowerCaseSearchParams = useSearchParams({ lowerCaseKeys: true });
  const loadDataFrom = lowerCaseSearchParams.get('loaddatafrom');
  const lastLoadedUrlRef = useRef<string | null>(null);

  // Initializing the dicom local dataSource
  const dataSourceModules = useMemo(
    () => extensionManager.getModulesByType(MODULE_TYPES.DATA_SOURCE) || [],
    []
  );

  const localDataSources = useMemo(
    () =>
      dataSourceModules.reduce((acc, curr) => {
        const mods = [];
        curr.module.forEach(mod => {
          if (mod.type === 'localApi') {
            mods.push(mod);
          }
        });
        return acc.concat(mods);
      }, []),
    [dataSourceModules]
  );

  const dataSource = useMemo(
    () => localDataSources[0]?.createDataSource({}),
    [localDataSources]
  );

  const microscopyExtensionLoaded = useMemo(
    () =>
      extensionManager
        .getRegisteredExtensionIds()
        .includes('@ohif/extension-dicom-microscopy'),
    []
  );

  const onDrop = useCallback(
    async acceptedFiles => {
      if (!dataSource) {
        console.warn('No local data source available to load studies.');
        return;
      }

      const studies = await filesToStudies(acceptedFiles, dataSource);

      const query = new URLSearchParams();
      let targetModePath = modePath;

      if (microscopyExtensionLoaded) {
        // TODO: for microscopy, we are forcing microscopy mode, which is not ideal.
        //     we should make the local drag and drop navigate to the worklist and
        //     there user can select microscopy mode
        const smStudies = studies.filter(id => {
          const study = DicomMetadataStore.getStudy(id);
          return (
            study.series.findIndex(s => s.Modality === 'SM' || s.instances[0].Modality === 'SM') >=
            0
          );
        });

        if (smStudies.length > 0) {
          smStudies.forEach(id => query.append('StudyInstanceUIDs', id));

          targetModePath = 'microscopy';
        }
      }

      // Todo: navigate to work list and let user select a mode
      studies.forEach(id => query.append('StudyInstanceUIDs', id));
      query.append('datasources', 'dicomlocal');

      navigate(`/${targetModePath}?${decodeURIComponent(query.toString())}`);
    },
    [dataSource, microscopyExtensionLoaded, modePath, navigate]
  );

  // Set body style
  useEffect(() => {
    document.body.classList.add('bg-black');
    return () => {
      document.body.classList.remove('bg-black');
    };
  }, []);

  useEffect(() => {
    if (!loadDataFrom || loadDataFrom === lastLoadedUrlRef.current) {
      return;
    }

    lastLoadedUrlRef.current = loadDataFrom;
    const abortController = new AbortController();
    const extractedFiles: File[] = [];
    const hud = ensureHud();
    const startedAt = performance.now();
    let latestReceived = 0;
    let latestTotal = 0;

    const updateHud = () => {
      const elapsedSec = Math.max((performance.now() - startedAt) / 1000, 0.001);
      const speed = latestReceived ? latestReceived / elapsedSec : NaN;
      const eta =
        latestTotal && Number.isFinite(speed) && speed > 0
          ? (latestTotal - latestReceived) / speed
          : NaN;
      const pct = latestTotal ? (latestReceived / latestTotal) * 100 : NaN;

      hud.update(
        [
          'Loading study from URL...',
          latestTotal
            ? `${pct.toFixed(1)}%  ${formatBytes(latestReceived)} / ${formatBytes(latestTotal)}`
            : `${formatBytes(latestReceived)} downloaded`,
          Number.isFinite(speed)
            ? `${formatBytes(speed)}/s  ETA ${formatEta(eta)}`
            : undefined,
          `Extracted files: ${extractedFiles.length}`,
        ].filter(Boolean) as string[]
      );
    };

    setDropInitiated(true);
    updateHud();

    downloadAndExtractZip(loadDataFrom, {
      signal: abortController.signal,
      onProgress: (received, total) => {
        latestReceived = received;
        latestTotal = total || latestTotal;
        updateHud();
      },
      onFile: file => {
        extractedFiles.push(file);
        updateHud();
      },
    })
      .then(async () => {
        if (!abortController.signal.aborted) {
          await onDrop(extractedFiles);
        }
      })
      .catch(err => {
        if (abortController.signal.aborted) {
          return;
        }
        console.error('Failed to load data from presigned URL', err);
        window.alert('Could not load the study from loadDataFrom. Please try again later.');
        setDropInitiated(false);
      })
      .finally(() => {
        hud.destroy();
      });

    return () => {
      abortController.abort();
      hud.destroy();
    };
  }, [loadDataFrom, onDrop]);

  return (
    <Dropzone
      ref={dropzoneRef}
      onDrop={acceptedFiles => {
        setDropInitiated(true);
        onDrop(acceptedFiles);
      }}
      noClick
    >
      {({ getRootProps }) => (
        <div
          {...getRootProps()}
          style={{ width: '100%', height: '100%' }}
        >
          <div className="flex h-screen w-screen items-center justify-center ">
            <div className="bg-secondary-dark mx-auto space-y-2 rounded-lg py-8 px-8 drop-shadow-md">
              <div className="flex items-center justify-center">
                <Icon
                  name="logo-dark-background"
                  className="h-28"
                />
              </div>
              <div className="space-y-2 pt-4 text-center">
                {dropInitiated ? (
                  <div className="flex flex-col items-center justify-center pt-48">
                    <LoadingIndicatorProgress
                      className={'h-full w-full bg-black'}
                      textBlock={null}
                      progress={undefined}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-base text-blue-300">
                      Note: You data is not uploaded to any server, it will stay in your local
                      browser application
                    </p>
                    <p className="text-xg text-primary-active pt-6 font-semibold">
                      Drag and Drop DICOM files here to load them in the Viewer
                    </p>
                    <p className="text-lg text-blue-300">Or click to </p>
                  </div>
                )}
              </div>
              <div className="flex justify-around pt-4 ">
                {getLoadButton(onDrop, 'Load files', false)}
                {getLoadButton(onDrop, 'Load folders', true)}
              </div>
            </div>
          </div>
        </div>
      )}
    </Dropzone>
  );
}

export default Local;
