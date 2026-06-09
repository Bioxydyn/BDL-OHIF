import { utilities as csUtils } from '@cornerstonejs/core';
import { SegmentationRepresentations } from '@cornerstonejs/tools/enums';
import i18n from '@ohif/i18n';
import { ServicesManager } from '@ohif/core';

type SegmentConfig = {
  label: string;
  active?: boolean;
};

function _createDefaultSegments(
  createInitialSegment?: boolean,
  segmentLabels?: string[]
): Record<number, SegmentConfig> {
  if (segmentLabels?.length) {
    return segmentLabels.reduce((segments, label, index) => {
      segments[index + 1] = {
        label,
        active: index === 0,
      };
      return segments;
    }, {} as Record<number, SegmentConfig>);
  }

  return createInitialSegment
    ? {
        1: {
          label: `${i18n.t('Tools:Segment')} 1`,
          active: true,
        },
      }
    : {};
}

type CreateSegmentationForViewportOptions = {
  displaySetInstanceUID?: string;
  label?: string;
  segmentationId?: string;
  createInitialSegment?: boolean;
  segmentLabels?: string[];
};

type CreateSegmentationForViewportParams = {
  viewportId: string;
  options?: CreateSegmentationForViewportOptions;
  segmentationType: SegmentationRepresentations;
};

/**
 * Creates a segmentation for the active viewport.
 */
export async function createSegmentationForViewport(
  servicesManager: ServicesManager,
  { viewportId, options = {}, segmentationType }: CreateSegmentationForViewportParams
): Promise<string> {
  const { viewportGridService, displaySetService, segmentationService } = servicesManager.services;
  const { viewports } = viewportGridService.getState();
  const targetViewportId = viewportId;

  const viewport = viewports.get(targetViewportId);

  const displaySetInstanceUID = options.displaySetInstanceUID || viewport.displaySetInstanceUIDs[0];

  const segs = segmentationService.getSegmentations();

  const label = options.label || `${i18n.t('Tools:Segmentation')} ${segs.length + 1}`;
  const segmentationId = options.segmentationId || `${csUtils.uuidv4()}`;

  const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);

  const segmentationCreationOptions = {
    label,
    segmentationId,
    segments: _createDefaultSegments(options.createInitialSegment, options.segmentLabels),
  };

  const generatedSegmentationId = await (segmentationType === SegmentationRepresentations.Labelmap
    ? segmentationService.createLabelmapForDisplaySet(displaySet, segmentationCreationOptions)
    : segmentationService.createContourForDisplaySet(displaySet, segmentationCreationOptions));

  await segmentationService.addSegmentationRepresentation(viewportId, {
    segmentationId,
    type: segmentationType,
  });

  return generatedSegmentationId;
}
