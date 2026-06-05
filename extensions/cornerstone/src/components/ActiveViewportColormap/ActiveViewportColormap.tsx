import React, { ReactElement, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useViewportGrid, PanelSection } from '@ohif/ui-next';
import { useActiveViewportDisplaySets } from '@ohif/core';
import { StackViewport, Types } from '@cornerstonejs/core';
import { nonWLModalities } from '../WindowLevelActionMenu/WindowLevelActionMenu';

const ActiveViewportColormap = ({ servicesManager, commandsManager }: withAppTypes): ReactElement => {
  const [viewportGrid] = useViewportGrid();
  const { activeViewportId } = viewportGrid;
  const displaySets = useActiveViewportDisplaySets({ servicesManager });
  const { customizationService, cornerstoneViewportService } = servicesManager.services;
  const { colormaps = [] } = customizationService.getCustomization('cornerstone.colorbar') ?? {};

  const eligibleDisplaySets = useMemo(
    () => displaySets.filter(displaySet => !nonWLModalities.includes(displaySet.Modality)),
    [displaySets]
  );

  const [activeDisplaySetUID, setActiveDisplaySetUID] = useState<string | null>(null);
  const [activeColormapName, setActiveColormapName] = useState<string>('Grayscale');

  useEffect(() => {
    if (!eligibleDisplaySets.length) {
      setActiveDisplaySetUID(null);
      return;
    }

    if (
      activeDisplaySetUID &&
      eligibleDisplaySets.some(displaySet => displaySet.displaySetInstanceUID === activeDisplaySetUID)
    ) {
      return;
    }

    setActiveDisplaySetUID(eligibleDisplaySets[0].displaySetInstanceUID);
  }, [eligibleDisplaySets, activeDisplaySetUID]);

  useEffect(() => {
    if (!activeViewportId || !activeDisplaySetUID) {
      return;
    }

    const activeDisplaySet = eligibleDisplaySets.find(
      displaySet => displaySet.displaySetInstanceUID === activeDisplaySetUID
    );
    if (!activeDisplaySet) {
      return;
    }

    const viewport = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);
    if (!viewport) {
      return;
    }

    let colormap;
    if (viewport instanceof StackViewport) {
      colormap = viewport.getProperties().colormap;
    } else {
      const actorEntry = viewport
        .getActors()
        .find(entry => entry.referencedId.includes(activeDisplaySet.displaySetInstanceUID));
      if (actorEntry) {
        colormap = (viewport as Types.IVolumeViewport).getProperties(actorEntry.referencedId)?.colormap;
      }
    }

    setActiveColormapName(colormap?.name || 'Grayscale');
  }, [
    activeViewportId,
    activeDisplaySetUID,
    eligibleDisplaySets,
    cornerstoneViewportService,
  ]);

  if (!activeViewportId || !eligibleDisplaySets.length || colormaps.length === 0) {
    return null;
  }

  const activeDisplaySet = eligibleDisplaySets.find(
    displaySet => displaySet.displaySetInstanceUID === activeDisplaySetUID
  );

  return (
    <PanelSection title="Color LUT">
      {eligibleDisplaySets.length > 1 && (
        <div className="mb-3 flex flex-col gap-1">
          <label className="text-aqua-pale text-sm">Display Set</label>
          <select
            className="bg-secondary-dark border-secondary-light rounded px-2 py-1 text-white"
            value={activeDisplaySetUID || ''}
            onChange={event => setActiveDisplaySetUID(event.target.value)}
          >
            {eligibleDisplaySets.map(displaySet => (
              <option key={displaySet.displaySetInstanceUID} value={displaySet.displaySetInstanceUID}>
                {displaySet.SeriesDescription || displaySet.Modality || displaySet.displaySetInstanceUID}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label className="text-aqua-pale text-sm">Colormap</label>
        <select
          className="bg-secondary-dark border-secondary-light rounded px-2 py-1 text-white"
          value={activeColormapName}
          onChange={event => {
            const nextColormap = colormaps.find(colormap => colormap.Name === event.target.value);
            if (!nextColormap || !activeDisplaySet) {
              return;
            }

            commandsManager.run({
              commandName: 'setViewportColormap',
              commandOptions: {
                viewportId: activeViewportId,
                displaySetInstanceUID: activeDisplaySet.displaySetInstanceUID,
                colormap: nextColormap,
                immediate: true,
              },
              context: 'CORNERSTONE',
            });
            setActiveColormapName(nextColormap.Name);
            console.info('[BDL-OHIF] Updated viewport colormap from panel.', {
              viewportId: activeViewportId,
              displaySetInstanceUID: activeDisplaySet.displaySetInstanceUID,
              colormap: nextColormap.Name,
            });
          }}
        >
          {colormaps.map(colormap => (
            <option key={colormap.Name} value={colormap.Name}>
              {colormap.description || colormap.Name}
            </option>
          ))}
        </select>
      </div>
    </PanelSection>
  );
};

ActiveViewportColormap.propTypes = {
  servicesManager: PropTypes.object.isRequired,
  commandsManager: PropTypes.object.isRequired,
};

export default ActiveViewportColormap;
