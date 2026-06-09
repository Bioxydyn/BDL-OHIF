import { CustomDropdownMenuContent } from './CustomDropdownMenuContent';
import { CustomSegmentStatisticsHeader } from './CustomSegmentStatisticsHeader';
import SegmentationToolConfig from '../components/SegmentationToolConfig';
import React from 'react';
import { SegmentationRepresentations } from '@cornerstonejs/tools/enums';

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

export default function getSegmentationPanelCustomization({ commandsManager, servicesManager }) {
  const { segmentationService } = servicesManager.services;

  let contourRenderFillChangedGlobally = false;

  const { unsubscribe } = segmentationService.subscribe(
    segmentationService.EVENTS.SEGMENTATION_STYLE_MODIFIED,
    ({ specifier, style }) => {
      if (
        specifier.type === SegmentationRepresentations.Contour &&
        specifier.segmentationId == null &&
        specifier.viewportId == null &&
        style.renderFill != null
      ) {
        unsubscribe();
        contourRenderFillChangedGlobally = true;
      }
    }
  );

  return {
    'panelSegmentation.customDropdownMenuContent': CustomDropdownMenuContent,
    'panelSegmentation.customSegmentStatisticsHeader': CustomSegmentStatisticsHeader,
    'panelSegmentation.disableEditing': false,
    'panelSegmentation.showAddSegment': true,
    'panelSegmentation.onSegmentationAdd': async ({
      segmentationRepresentationType = SegmentationRepresentations.Labelmap,
    }) => {
      const { viewportGridService } = servicesManager.services;
      const viewportId = viewportGridService.getState().activeViewportId;
      if (segmentationRepresentationType === SegmentationRepresentations.Labelmap) {
        const requestedSegmentLabels = getRequestedSegmentLabels();
        await commandsManager.run('createLabelmapForViewport', {
          viewportId,
          options: requestedSegmentLabels.length
            ? {
                label: 'VoxelFlow Segmentation',
                segmentLabels: requestedSegmentLabels,
              }
            : undefined,
        });
      } else if (segmentationRepresentationType === SegmentationRepresentations.Contour) {
        const segmentationId = await commandsManager.run('createContourForViewport', {
          viewportId,
        });
        if (!contourRenderFillChangedGlobally) {
          segmentationService.setStyle(
            { segmentationId, type: SegmentationRepresentations.Contour },
            {
              renderFill: true,
              renderFillInactive: true,
            },
            false
          );
        }

        if (contourRenderFillChangedGlobally) {
          return;
        }

        const { unsubscribe } = segmentationService.subscribe(
          segmentationService.EVENTS.SEGMENTATION_STYLE_MODIFIED,
          ({ specifier, style }) => {
            if (
              specifier.type === SegmentationRepresentations.Contour &&
              specifier.segmentationId == null &&
              specifier.viewportId == null &&
              style.renderFill != null
            ) {
              contourRenderFillChangedGlobally = true;
              unsubscribe();
              segmentationService.setStyle(
                { segmentationId, type: SegmentationRepresentations.Contour },
                {},
                false
              );
            }
          }
        );
      }
    },
    'panelSegmentation.tableMode': 'collapsed',
    'panelSegmentation.readableText': {
      min: 'Min Value',
      minLPS: 'Min Coord',
      max: 'Max Value',
      maxLPS: 'Max Coord',
      mean: 'Mean Value',
      stdDev: 'Standard Deviation',
      count: 'Voxel Count',
      median: 'Median',
      skewness: 'Skewness',
      kurtosis: 'Kurtosis',
      peakValue: 'Peak Value',
      peakLPS: 'Peak Coord',
      volume: 'Volume',
      lesionGlycolysis: 'Lesion Glycolysis',
      center: 'Center',
    },
    'labelMapSegmentationToolbox.config': () => {
      return <SegmentationToolConfig />;
    },
    'contourSegmentationToolbox.config': () => {
      return <SegmentationToolConfig />;
    },
  };
}
