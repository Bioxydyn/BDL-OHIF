import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import classnames from 'classnames';
import { useNavigate } from 'react-router-dom';
import { DicomMetadataStore, MODULE_TYPES } from '@ohif/core';

import Dropzone from 'react-dropzone';
import filesToStudies from './filesToStudies';

import { extensionManager } from '../../App.tsx';
import useSearchParams from '../../hooks/useSearchParams.ts';

import { Icon, Button, LoadingIndicatorProgress } from '@ohif/ui';
import { unzipSync } from 'fflate';

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

const toError = (value: unknown, fallbackMessage: string) => {
  if (value instanceof Error) {
    return value;
  }

  const str = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return new Error(`${fallbackMessage}${str ? `: ${str}` : ''}`);
};

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
  let buffer: Uint8Array;

  try {
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (value?.byteLength) {
          chunks.push(value);
          received += value.byteLength;
          onProgress?.(received, total);
        }
        if (done) {
          break;
        }
      }

      buffer = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) {
        buffer.set(c, offset);
        offset += c.byteLength;
      }
    } else {
      const ab = await response.arrayBuffer();
      buffer = new Uint8Array(ab);
      onProgress?.(buffer.byteLength, total || buffer.byteLength);
    }
  } catch (err) {
    throw toError(err, 'Error while downloading archive');
  }

  try {
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
  } catch (err) {
    throw toError(err, 'Failed to unzip archive');
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
      let studyUIDsForNavigation = studies;

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
          studyUIDsForNavigation = smStudies;
          targetModePath = 'microscopy';
        }
      }

      const shouldGoDirectToViewer =
        studyUIDsForNavigation?.length === 1 && targetModePath !== 'microscopy';
      if (shouldGoDirectToViewer) {
        targetModePath = 'viewer/dicomlocal';
      }

      const studyIdsForQuery =
        (shouldGoDirectToViewer
          ? studyUIDsForNavigation?.slice(0, 1)
          : studyUIDsForNavigation) || [];

      studyIdsForQuery.forEach(id => query.append('StudyInstanceUIDs', id));

      query.append('datasources', 'dicomlocal');

      navigate(`/${targetModePath}?${decodeURIComponent(query.toString())}`);
    },
    [dataSource, loadDataFrom, microscopyExtensionLoaded, modePath, navigate]
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
        const errorObj = toError(err, 'Unknown error');
        console.error('Failed to load data from presigned URL', errorObj, errorObj.stack);
        window.alert(`Could not load the study from loadDataFrom.\n${errorObj.message}`);
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
