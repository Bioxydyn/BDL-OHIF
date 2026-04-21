import React from 'react';
import { SegmentationTable } from '@ohif/ui-next';
import { useActiveViewportSegmentationRepresentations } from '../hooks/useActiveViewportSegmentationRepresentations';
import { metaData } from '@cornerstonejs/core';

function getRequestedSegmentLabels(): string[] {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('roiNames') || params.get('segmentLabels') || params.get('labels');

  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

export default function PanelSegmentation({
  servicesManager,
  commandsManager,
  children,
}: withAppTypes) {
  const { customizationService, viewportGridService, displaySetService } = servicesManager.services;

  const createSegmentationForViewport = async (viewportId?: string) => {
    const requestedSegmentLabels = getRequestedSegmentLabels();

    if (!viewportId) {
      const viewportIds = Array.from(viewportGridService.getState().viewports.keys());
      console.error('[BDL-OHIF] Unable to create segmentation because no active viewport is set.', {
        viewportIds,
        requestedSegmentLabels,
      });
      throw new Error('No active viewport selected for segmentation creation.');
    }

    if (requestedSegmentLabels.length === 0) {
      console.info('[BDL-OHIF] Creating segmentation without preset ROI labels.', {
        viewportId,
      });
      return commandsManager.run('createLabelmapForViewport', { viewportId });
    }

    console.info('[BDL-OHIF] Creating segmentation with preset ROI labels.', {
      viewportId,
      requestedSegmentLabels,
    });

    try {
      const segmentationId = await commandsManager.run('createLabelmapForViewport', {
        viewportId,
        options: {
          label: 'VoxelFlow Segmentation',
          segmentLabels: requestedSegmentLabels,
        },
      });

      console.info('[BDL-OHIF] Created segmentation with preset ROI labels.', {
        viewportId,
        segmentationId,
        requestedSegmentLabels,
      });

      return segmentationId;
    } catch (error) {
      console.error('[BDL-OHIF] Failed to create segmentation with preset ROI labels.', {
        viewportId,
        requestedSegmentLabels,
        error,
      });
      throw error;
    }
  };

  const { segmentationsWithRepresentations, disabled } =
    useActiveViewportSegmentationRepresentations({
      servicesManager,
    });

  const handlers = {
    onSegmentationAdd: async () => {
      const viewportId = viewportGridService.getState().activeViewportId;
      return createSegmentationForViewport(viewportId);
    },

    onSegmentationClick: (segmentationId: string) => {
      commandsManager.run('setActiveSegmentation', { segmentationId });
    },

    onSegmentAdd: segmentationId => {
      commandsManager.run('addSegment', { segmentationId });
    },

    onSegmentClick: (segmentationId, segmentIndex) => {
      commandsManager.run('setActiveSegmentAndCenter', { segmentationId, segmentIndex });
    },

    onSegmentEdit: (segmentationId, segmentIndex) => {
      commandsManager.run('editSegmentLabel', { segmentationId, segmentIndex });
    },

    onSegmentationEdit: segmentationId => {
      commandsManager.run('editSegmentationLabel', { segmentationId });
    },

    onSegmentColorClick: (segmentationId, segmentIndex) => {
      commandsManager.run('editSegmentColor', { segmentationId, segmentIndex });
    },

    onSegmentDelete: (segmentationId, segmentIndex) => {
      commandsManager.run('deleteSegment', { segmentationId, segmentIndex });
    },

    onToggleSegmentVisibility: (segmentationId, segmentIndex, type) => {
      commandsManager.run('toggleSegmentVisibility', { segmentationId, segmentIndex, type });
    },

    onToggleSegmentLock: (segmentationId, segmentIndex) => {
      commandsManager.run('toggleSegmentLock', { segmentationId, segmentIndex });
    },

    onToggleSegmentationRepresentationVisibility: (segmentationId, type) => {
      commandsManager.run('toggleSegmentationVisibility', { segmentationId, type });
    },

    onSegmentationDownload: segmentationId => {
      commandsManager.run('downloadSegmentation', { segmentationId });
    },

    onSegmentationVfSave: segmentationId => {
      commandsManager.run('exportVFSegmentation', { segmentationId });
    },

    storeSegmentation: async segmentationId => {
      commandsManager.run('storeSegmentation', { segmentationId });
    },

    onSegmentationDownloadRTSS: segmentationId => {
      commandsManager.run('downloadRTSS', { segmentationId });
    },

    setStyle: (segmentationId, type, key, value) => {
      commandsManager.run('setSegmentationStyle', { segmentationId, type, key, value });
    },

    toggleRenderInactiveSegmentations: () => {
      commandsManager.run('toggleRenderInactiveSegmentations');
    },

    onSegmentationRemoveFromViewport: segmentationId => {
      commandsManager.run('removeSegmentationFromViewport', { segmentationId });
    },

    onSegmentationDelete: segmentationId => {
      commandsManager.run('deleteSegmentation', { segmentationId });
    },

    setFillAlpha: ({ type }, value) => {
      commandsManager.run('setFillAlpha', { type, value });
    },

    setOutlineWidth: ({ type }, value) => {
      commandsManager.run('setOutlineWidth', { type, value });
    },

    setRenderFill: ({ type }, value) => {
      commandsManager.run('setRenderFill', { type, value });
    },

    setRenderOutline: ({ type }, value) => {
      commandsManager.run('setRenderOutline', { type, value });
    },

    setFillAlphaInactive: ({ type }, value) => {
      commandsManager.run('setFillAlphaInactive', { type, value });
    },

    getRenderInactiveSegmentations: () => {
      return commandsManager.run('getRenderInactiveSegmentations');
    },
  };

  const { mode: SegmentationTableMode } = customizationService.getCustomization(
    'PanelSegmentation.tableMode',
    {
      id: 'default.segmentationTable.mode',
      mode: 'collapsed',
    }
  );

  // custom onSegmentationAdd if provided
  const { onSegmentationAdd } = customizationService.getCustomization(
    'PanelSegmentation.onSegmentationAdd',
    {
      id: 'segmentation.onSegmentationAdd',
      onSegmentationAdd: handlers.onSegmentationAdd,
    }
  );

  const { disableEditing } = customizationService.getCustomization(
    'PanelSegmentation.disableEditing',
    {
      id: 'default.disableEditing',
      disableEditing: false,
    }
  );

  const { showAddSegment } = customizationService.getCustomization(
    'PanelSegmentation.showAddSegment',
    {
      id: 'default.showAddSegment',
      showAddSegment: true,
    }
  );

  const exportOptions = segmentationsWithRepresentations.map(({ segmentation }) => {
    const { representationData, segmentationId } = segmentation;
    const { Labelmap } = representationData;

    if (!Labelmap) {
      return {
        segmentationId,
        isExportable: true,
      };
    }

    const referencedImageIds = Labelmap.referencedImageIds;
    const firstImageId = referencedImageIds[0];

    const instance = metaData.get('instance', firstImageId);

    if (!instance) {
      return {
        segmentationId,
        isExportable: false,
      };
    }

    const { SOPInstanceUID, SeriesInstanceUID } = instance;

    const displaySet = displaySetService.getDisplaySetForSOPInstanceUID(
      SOPInstanceUID,
      SeriesInstanceUID
    );
    const isExportable = displaySet.isReconstructable;

    return {
      segmentationId,
      isExportable,
    };
  });

  return (
    <>
      <SegmentationTable
        disabled={disabled}
        data={segmentationsWithRepresentations}
        mode={SegmentationTableMode}
        title="Segmentations"
        exportOptions={exportOptions}
        disableEditing={disableEditing}
        onSegmentationAdd={onSegmentationAdd}
        onSegmentationClick={handlers.onSegmentationClick}
        onSegmentationDelete={handlers.onSegmentationDelete}
        showAddSegment={showAddSegment}
        onSegmentAdd={handlers.onSegmentAdd}
        onSegmentClick={handlers.onSegmentClick}
        onSegmentEdit={handlers.onSegmentEdit}
        onSegmentationEdit={handlers.onSegmentationEdit}
        onSegmentColorClick={handlers.onSegmentColorClick}
        onSegmentDelete={handlers.onSegmentDelete}
        onToggleSegmentVisibility={handlers.onToggleSegmentVisibility}
        onToggleSegmentLock={handlers.onToggleSegmentLock}
        onToggleSegmentationRepresentationVisibility={
          handlers.onToggleSegmentationRepresentationVisibility
        }
        onSegmentationDownload={handlers.onSegmentationDownload}
        onSegmentationVfSave={handlers.onSegmentationVfSave}
        storeSegmentation={handlers.storeSegmentation}
        onSegmentationDownloadRTSS={handlers.onSegmentationDownloadRTSS}
        setStyle={handlers.setStyle}
        toggleRenderInactiveSegmentations={handlers.toggleRenderInactiveSegmentations}
        onSegmentationRemoveFromViewport={handlers.onSegmentationRemoveFromViewport}
        setFillAlpha={handlers.setFillAlpha}
        setOutlineWidth={handlers.setOutlineWidth}
        setRenderFill={handlers.setRenderFill}
        setRenderOutline={handlers.setRenderOutline}
        setFillAlphaInactive={handlers.setFillAlphaInactive}
        renderInactiveSegmentations={handlers.getRenderInactiveSegmentations()}
      >
        {children}
        <SegmentationTable.Config />
        <SegmentationTable.AddSegmentationRow />

        {SegmentationTableMode === 'collapsed' ? (
          <SegmentationTable.Collapsed>
            <SegmentationTable.SelectorHeader />
            <SegmentationTable.AddSegmentRow />
            <SegmentationTable.Segments />
          </SegmentationTable.Collapsed>
        ) : (
          <SegmentationTable.Expanded>
            <SegmentationTable.Header />
            {/* <SegmentationTable.AddSegmentRow /> */}
            <SegmentationTable.Segments />
          </SegmentationTable.Expanded>
        )}
      </SegmentationTable>
    </>
  );
}
