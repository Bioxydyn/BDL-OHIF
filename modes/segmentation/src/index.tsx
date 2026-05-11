import { hotkeys } from '@ohif/core';
import { ViewportGridService } from '@ohif/core';
import { id } from './id';
import toolbarButtons from './toolbarButtons';
import segmentationButtons from './segmentationButtons';
import initToolGroups from './initToolGroups';

const ohif = {
  layout: '@ohif/extension-default.layoutTemplateModule.viewerLayout',
  sopClassHandler: '@ohif/extension-default.sopClassHandlerModule.stack',
  hangingProtocol: '@ohif/extension-default.hangingProtocolModule.default',
  leftPanel: '@ohif/extension-default.panelModule.seriesList',
  rightPanel: '@ohif/extension-default.panelModule.measure',
};

const cornerstone = {
  viewport: '@ohif/extension-cornerstone.viewportModule.cornerstone',
  panelTool: '@ohif/extension-cornerstone.panelModule.panelSegmentationWithTools',
  activeViewportColormap: '@ohif/extension-cornerstone.panelModule.activeViewportColormap',
};

const segmentation = {
  sopClassHandler: '@ohif/extension-cornerstone-dicom-seg.sopClassHandlerModule.dicom-seg',
  viewport: '@ohif/extension-cornerstone-dicom-seg.viewportModule.dicom-seg',
};

/**
 * Just two dependencies to be able to render a viewport with panels in order
 * to make sure that the mode is working.
 */
const extensionDependencies = {
  '@ohif/extension-default': '^3.0.0',
  '@ohif/extension-cornerstone': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-seg': '^3.0.0',
};

const DEFAULT_KTRANS_COLORMAP = 'hot_iron';
const KTRANS_SERIES_DESCRIPTION = 'Ktrans (extended-tofts)';

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
  const existingColormap =
    existingProperties instanceof Map
      ? undefined
      : existingProperties?.colormap;

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

  console.info('[BDL-OHIF] Applied default Ktrans colormap.', {
    viewportId: targetViewportId,
    seriesDescription: displaySet.SeriesDescription,
    colormap: DEFAULT_KTRANS_COLORMAP,
  });
}

function modeFactory({ modeConfiguration }) {
  return {
    /**
     * Mode ID, which should be unique among modes used by the viewer. This ID
     * is used to identify the mode in the viewer's state.
     */
    id,
    routeName: 'segmentation',
    /**
     * Mode name, which is displayed in the viewer's UI in the workList, for the
     * user to select the mode.
     */
    displayName: 'Segmentation',
    /**
     * Runs when the Mode Route is mounted to the DOM. Usually used to initialize
     * Services and other resources.
     */
    onModeEnter: ({ servicesManager, extensionManager, commandsManager }: withAppTypes) => {
      const { measurementService, toolbarService, toolGroupService, viewportGridService } = servicesManager.services;

      measurementService.clearMeasurements();

      // Init Default and SR ToolGroups
      initToolGroups(extensionManager, toolGroupService, commandsManager);

      toolbarService.addButtons(toolbarButtons);
      toolbarService.addButtons(segmentationButtons);

      toolbarService.createButtonSection('primary', [
        'WindowLevel',
        'Pan',
        'Zoom',
        'TrackballRotate',
        'Capture',
        'Layout',
        'Crosshairs',
        'MoreTools',
      ]);
      toolbarService.createButtonSection('segmentationToolbox', ['BrushTools', 'Shapes']);

      const applyColormapForViewport = ({ viewportId }: { viewportId?: string } = {}) => {
        applyDefaultKtransColormap({ servicesManager, viewportId });
      };

      const subscriptions = [
        viewportGridService.subscribe(
          ViewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED,
          ({ viewportId }) => applyColormapForViewport({ viewportId })
        ),
        viewportGridService.subscribe(
          ViewportGridService.EVENTS.GRID_STATE_CHANGED,
          ({ viewports }) => {
            viewports?.forEach(viewport => applyColormapForViewport({ viewportId: viewport.viewportId }));
          }
        ),
        viewportGridService.subscribe(ViewportGridService.EVENTS.VIEWPORTS_READY, () => {
          applyColormapForViewport({ viewportId: viewportGridService.getActiveViewportId() });
        }),
      ];

      (servicesManager.services as any).__vfKtransColormapSubscriptions = subscriptions;
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

      const subscriptions = (servicesManager.services as any).__vfKtransColormapSubscriptions || [];
      subscriptions.forEach(subscription => subscription.unsubscribe());
      delete (servicesManager.services as any).__vfKtransColormapSubscriptions;

      uiDialogService.dismissAll();
      uiModalService.hide();
      toolGroupService.destroy();
      syncGroupService.destroy();
      segmentationService.destroy();
      cornerstoneViewportService.destroy();
    },
    /** */
    validationTags: {
      study: [],
      series: [],
    },
    /**
     * A boolean return value that indicates whether the mode is valid for the
     * modalities of the selected studies. Currently we don't have stack viewport
     * segmentations and we should exclude them
     */
    isValidMode: ({ modalities }) => {
      // Don't show the mode if the selected studies have only one modality
      // that is not supported by the mode
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
    /**
     * Mode Routes are used to define the mode's behavior. A list of Mode Route
     * that includes the mode's path and the layout to be used. The layout will
     * include the components that are used in the layout. For instance, if the
     * default layoutTemplate is used (id: '@ohif/extension-default.layoutTemplateModule.viewerLayout')
     * it will include the leftPanels, rightPanels, and viewports. However, if
     * you define another layoutTemplate that includes a Footer for instance,
     * you should provide the Footer component here too. Note: We use Strings
     * to reference the component's ID as they are registered in the internal
     * ExtensionManager. The template for the string is:
     * `${extensionId}.{moduleType}.${componentId}`.
     */
    routes: [
      {
        path: 'template',
        layoutTemplate: ({ location, servicesManager }) => {
          return {
            id: ohif.layout,
            props: {
              leftPanels: [ohif.leftPanel],
              rightPanels: [[cornerstone.panelTool, cornerstone.activeViewportColormap]],
              // leftPanelClosed: true,
              viewports: [
                {
                  namespace: cornerstone.viewport,
                  displaySetsToDisplay: [ohif.sopClassHandler],
                },
                {
                  namespace: segmentation.viewport,
                  displaySetsToDisplay: [segmentation.sopClassHandler],
                },
              ],
            },
          };
        },
      },
    ],
    /** List of extensions that are used by the mode */
    extensions: extensionDependencies,
    /** HangingProtocol used by the mode */
    // Commented out to just use the most applicable registered hanging protocol
    // The example is used for a grid layout to specify that as a preferred layout
    // hangingProtocol: ['@ohif/mnGrid'],
    /** SopClassHandlers used by the mode */
    sopClassHandlers: [ohif.sopClassHandler, segmentation.sopClassHandler],
    /** hotkeys for mode */
    hotkeys: [...hotkeys.defaults.hotkeyBindings],
  };
}

const mode = {
  id,
  modeFactory,
  extensionDependencies,
};

export default mode;
