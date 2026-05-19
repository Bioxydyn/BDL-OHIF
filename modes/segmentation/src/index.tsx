import { ViewportGridService } from '@ohif/core';
import { id } from './id';
import toolbarButtons from './toolbarButtons';
import initToolGroups from './initToolGroups';
import setUpAutoTabSwitchHandler from './utils/setUpAutoTabSwitchHandler';
import { ohif, cornerstone, extensionDependencies, dicomRT, segmentation } from '@ohif/mode-basic';
export * from './toolbarButtons';

const DEFAULT_KTRANS_COLORMAP = 'hot_iron';
const KTRANS_SERIES_DESCRIPTION = 'Ktrans (extended-tofts)';
const ACTIVE_VIEWPORT_COLORMAP_PANEL = '@ohif/extension-cornerstone.panelModule.activeViewportColormap';

function applyDefaultKtransColormap({ servicesManager, viewportId }: withAppTypes & { viewportId?: string }) {
  const { viewportGridService, displaySetService, cornerstoneViewportService } = servicesManager.services;
  const targetViewportId = viewportId || viewportGridService.getActiveViewportId();

  if (!targetViewportId) {
    return;
  }

  const displaySetUIDs = viewportGridService.getDisplaySetsUIDsForViewport(targetViewportId);
  if (!displaySetUIDs?.length) {
    return;
  }

  const displaySet = displaySetService.getDisplaySetByUID(displaySetUIDs[0]);
  if (!displaySet || displaySet.SeriesDescription !== KTRANS_SERIES_DESCRIPTION) {
    return;
  }

  const existingLutPresentation = cornerstoneViewportService.getPresentations(targetViewportId)?.lutPresentation;
  const existingProperties = existingLutPresentation?.properties;
  const existingColormap = existingProperties instanceof Map ? undefined : existingProperties?.colormap;

  if (existingColormap?.name) {
    return;
  }

  const viewportState = viewportGridService.getViewportState(targetViewportId);
  const viewportType = viewportState?.viewportOptions?.viewportType || 'stack';

  cornerstoneViewportService.setPresentations(targetViewportId, {
    lutPresentation: {
      viewportType,
      properties: {
        ...(existingProperties instanceof Map ? {} : existingProperties),
        colormap: { name: DEFAULT_KTRANS_COLORMAP },
      },
    },
  });
  cornerstoneViewportService.storePresentation({ viewportId: targetViewportId });

  console.info('[BDL-OHIF] Applied default Ktrans colormap.', {
    viewportId: targetViewportId,
    seriesDescription: displaySet.SeriesDescription,
    colormap: DEFAULT_KTRANS_COLORMAP,
  });
}

function modeFactory({ modeConfiguration }) {
  const _unsubscriptions = [];
  return {
    id,
    routeName: 'segmentation',
    displayName: 'Segmentation',
    onModeEnter: ({ servicesManager, extensionManager, commandsManager }: withAppTypes) => {
      const {
        measurementService,
        toolbarService,
        toolGroupService,
        segmentationService,
        viewportGridService,
        panelService,
      } = servicesManager.services;

      measurementService.clearMeasurements();
      initToolGroups(extensionManager, toolGroupService, commandsManager);
      toolbarService.register(toolbarButtons);

      toolbarService.updateSection(toolbarService.sections.primary, [
        'WindowLevel',
        'Pan',
        'Zoom',
        'TrackballRotate',
        'Capture',
        'Layout',
        'Crosshairs',
        'MoreTools',
      ]);

      toolbarService.updateSection(toolbarService.sections.viewportActionMenu.topLeft, [
        'orientationMenu',
        'dataOverlayMenu',
      ]);
      toolbarService.updateSection(toolbarService.sections.viewportActionMenu.bottomMiddle, [
        'AdvancedRenderingControls',
      ]);
      toolbarService.updateSection('AdvancedRenderingControls', [
        'windowLevelMenuEmbedded',
        'voiManualControlMenu',
        'Colorbar',
        'opacityMenu',
        'thresholdMenu',
      ]);
      toolbarService.updateSection(toolbarService.sections.viewportActionMenu.topRight, [
        'modalityLoadBadge',
        'trackingStatus',
        'navigationComponent',
      ]);
      toolbarService.updateSection(toolbarService.sections.viewportActionMenu.bottomLeft, [
        'windowLevelMenu',
      ]);
      toolbarService.updateSection('MoreTools', [
        'Reset',
        'rotate-right',
        'flipHorizontal',
        'ReferenceLines',
        'ImageOverlayViewer',
        'StackScroll',
        'invert',
        'Cine',
        'Magnify',
        'TagBrowser',
      ]);

      toolbarService.updateSection(toolbarService.sections.labelMapSegmentationToolbox, [
        'LabelMapTools',
      ]);
      toolbarService.updateSection(toolbarService.sections.contourSegmentationToolbox, [
        'ContourTools',
      ]);
      toolbarService.updateSection('LabelMapTools', [
        'LabelmapSlicePropagation',
        'BrushTools',
        'MarkerLabelmap',
        'RegionSegmentPlus',
        'Shapes',
        'LabelMapEditWithContour',
      ]);
      toolbarService.updateSection('ContourTools', [
        'PlanarFreehandContourSegmentationTool',
        'SculptorTool',
        'SplineContourSegmentationTool',
        'LivewireContourSegmentationTool',
      ]);
      toolbarService.updateSection(toolbarService.sections.labelMapSegmentationUtilities, [
        'LabelMapUtilities',
      ]);
      toolbarService.updateSection(toolbarService.sections.contourSegmentationUtilities, [
        'ContourUtilities',
      ]);
      toolbarService.updateSection('LabelMapUtilities', [
        'InterpolateLabelmap',
        'SegmentBidirectional',
      ]);
      toolbarService.updateSection('ContourUtilities', [
        'LogicalContourOperations',
        'SimplifyContours',
        'SmoothContours',
      ]);
      toolbarService.updateSection('BrushTools', ['Brush', 'Eraser', 'Threshold']);

      const { unsubscribeAutoTabSwitchEvents } = setUpAutoTabSwitchHandler({
        segmentationService,
        viewportGridService,
        panelService,
      });
      _unsubscriptions.push(...unsubscribeAutoTabSwitchEvents);

      const applyColormapForViewport = ({ viewportId }: { viewportId?: string } = {}) => {
        applyDefaultKtransColormap({ servicesManager, viewportId });
      };

      _unsubscriptions.push(
        viewportGridService.subscribe(
          ViewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED,
          ({ viewportId }) => applyColormapForViewport({ viewportId })
        )
      );
      _unsubscriptions.push(
        viewportGridService.subscribe(
          ViewportGridService.EVENTS.GRID_STATE_CHANGED,
          ({ viewports }) => {
            viewports?.forEach(viewport => applyColormapForViewport({ viewportId: viewport.viewportId }));
          }
        )
      );
      _unsubscriptions.push(
        viewportGridService.subscribe(ViewportGridService.EVENTS.VIEWPORTS_READY, () => {
          applyColormapForViewport({ viewportId: viewportGridService.getActiveViewportId() });
        })
      );
      applyColormapForViewport({ viewportId: viewportGridService.getActiveViewportId() });
    },
    onModeExit: ({ servicesManager }: withAppTypes) => {
      const {
        toolGroupService,
        syncGroupService,
        segmentationService,
        cornerstoneViewportService,
        uiDialogService,
        uiModalService,
      } = servicesManager.services;

      _unsubscriptions.forEach(unsubscribe => unsubscribe());
      _unsubscriptions.length = 0;

      uiDialogService.hideAll();
      uiModalService.hide();
      toolGroupService.destroy();
      syncGroupService.destroy();
      segmentationService.destroy();
      cornerstoneViewportService.destroy();
    },
    validationTags: {
      study: [],
      series: [],
    },
    isValidMode: ({ modalities }) => {
      const modalitiesArray = modalities.split('\\');
      return {
        valid:
          modalitiesArray.length === 1
            ? !['SM', 'ECG', 'OT', 'DOC'].includes(modalitiesArray[0])
            : true,
        description:
          'The mode does not support studies that ONLY include the following modalities: SM, OT, DOC',
      };
    },
    routes: [
      {
        path: 'template',
        layoutTemplate: ({ location, servicesManager }) => {
          return {
            id: ohif.layout,
            props: {
              leftPanels: [ohif.thumbnailList],
              leftPanelResizable: true,
              rightPanels: [
                cornerstone.labelMapSegmentationPanel,
                cornerstone.contourSegmentationPanel,
                ACTIVE_VIEWPORT_COLORMAP_PANEL,
              ],
              rightPanelResizable: true,
              viewports: [
                {
                  namespace: cornerstone.viewport,
                  displaySetsToDisplay: [ohif.sopClassHandler],
                },
                {
                  namespace: segmentation.viewport,
                  displaySetsToDisplay: [segmentation.sopClassHandler],
                },
                {
                  namespace: dicomRT.viewport,
                  displaySetsToDisplay: [dicomRT.sopClassHandler],
                },
              ],
            },
          };
        },
      },
    ],
    extensions: extensionDependencies,
    hangingProtocol: ['@ohif/mnGrid'],
    sopClassHandlers: [ohif.sopClassHandler, segmentation.sopClassHandler, dicomRT.sopClassHandler],
  };
}

const mode = {
  id,
  modeFactory,
  extensionDependencies,
};

export default mode;
