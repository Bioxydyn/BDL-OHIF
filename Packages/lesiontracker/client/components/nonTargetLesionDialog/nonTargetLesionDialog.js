function closeHandler(dialog) {
    // Hide the lesion dialog
    $(dialog).css('display', 'none');

    // Remove the backdrop
    $(".removableBackdrop").remove();
}

// This event sets lesion number for new lesion
function setLesionNumberCallback(measurementData, eventData, doneCallback) {
    // Get the current element's timepointID from the study date metadata
    var element = eventData.element;
    var enabledElement = cornerstone.getEnabledElement(element);
    var imageId = enabledElement.image.imageId;

    var study = cornerstoneTools.metaData.get('study', imageId);
    var timepoint = Timepoints.findOne({timepointName: study.studyDate});
    if (!timepoint) {
        return;
    }

    // TODO: Get patientId
    // TODO: add measurement data according to patientId to get correct lesion number for each patient

    measurementData.timepointID = timepoint.timepointID;

    // Get a lesion number for this lesion, depending on whether or not the same lesion previously
    // exists at a different timepoint
    var lesionNumber = measurementManagerDAL.getNewLesionNumber(measurementData.timepointID, isTarget=false);
    measurementData.lesionNumber = lesionNumber;

    // Set lesion number
    doneCallback(lesionNumber);
}

// This event determines whether or not to show the Non-Target lesion dialog
// If there already exists a lesion with this specific lesion number,
// related to the chosen location.
function getLesionLocationCallback(measurementData, eventData) {
    Template.nonTargetLesionDialog.measurementData = measurementData;

    // Get the non-target lesion location dialog
    var dialog = $("#nonTargetLesionLocationDialog");
    Template.nonTargetLesionDialog.dialog = dialog;

    // Show the backdrop
    UI.render(Template.removableBackdrop, document.body);

    // Make sure the context menu is closed when the user clicks away
    $(".removableBackdrop").one('mousedown touchstart', function() {
        closeHandler(dialog);
    });

    // Find the select option box
    var selectorLocation = dialog.find("select#selectNonTargetLesionLocation");
    var selectorResponse = dialog.find("select#selectNonTargetLesionLocationResponse");

    selectorLocation.find("option:first").prop("selected", "selected");
    selectorResponse.find("option:first").prop("selected", "selected");

    // Allow location selection
    selectorLocation.removeAttr("disabled");

    // Find out if this lesion number is already added in the lesion manager for another timepoint
    // If it is, disable selector location
    var locationUID = measurementManagerDAL.lesionNumberExists(measurementData);
    if (locationUID) {
        // Add an ID value to the tool data to link it to the Measurements collection
        measurementData.id = 'notready';

        measurementData.locationUID = locationUID;
        // Disable the selection of a new location
        disableLocationSelection(measurementData.locationUID);
    }

    // Disable selector location to prevent selecting a new location
    function disableLocationSelection(locationUID) {
        var locationName = measurementManagerDAL.getLocationName(locationUID);
        selectorLocation.find('option').each(function() {
            if ($(this).text() === locationName) {
                // Select location in locations dropdown list
                selectorLocation.find('option').eq($(this).index()).prop("selected", true);
            }
        });

        selectorLocation.prop("disabled", true);
    }

    // Show the nonTargetLesion dialog above
    var dialogProperty =  {
        top: eventData.currentPoints.page.y,
        left: eventData.currentPoints.page.x,
        display: 'block'
    };

    // Device is touch device or not
    // If device is touch device, set position center of screen vertically and horizontally
    if (isTouchDevice()) {
        // add dialogMobile class to provide a black,transparent background
        dialog.addClass("dialogMobile");
        dialogProperty.top = 0;
        dialogProperty.left = 0;
        dialogProperty.right = 0;
        dialogProperty.bottom = 0;
    }

    dialog.css(dialogProperty);
}

function changeLesionLocationCallback(measurementData, eventData, doneCallback) {
    Template.nonTargetLesionDialog.measurementData = measurementData;
    Template.nonTargetLesionDialog.doneCallback = doneCallback;

    // Get the non-target lesion location dialog
    var dialog = $("#nonTargetLesionRelabelDialog");
    Template.nonTargetLesionDialog.dialog = dialog;

    // Show the backdrop
    UI.render(Template.removableBackdrop, document.body);

    // Make sure the context menu is closed when the user clicks away
    $(".removableBackdrop").one('mousedown touchstart', function() {
        closeHandler(dialog);

        if (doneCallback && typeof doneCallback === 'function') {
            var deleteTool = true;
            doneCallback(measurementData, deleteTool);
        }
    });

    // Find the select option box
    var selectorLocation = dialog.find("select#selectNonTargetLesionLocation");
    var selectorResponse = dialog.find("select#selectNonTargetLesionLocationResponse");

    log.info(measurementData);
    selectorLocation.find("option:first").prop("selected", "selected");
    selectorResponse.find("option:first").prop("selected", "selected");

    // Allow location selection
    selectorLocation.removeAttr("disabled");

    // Show the nonTargetLesion dialog above
    var dialogProperty =  {
        top: eventData.currentPoints.page.y,
        left: eventData.currentPoints.page.x,
        display: 'block'
    };

    // Device is touch device or not
    // If device is touch device, set position center of screen vertically and horizontally
    if (isTouchDevice()) {
        // add dialogMobile class to provide a black,transparent background
        dialog.addClass("dialogMobile");
        dialogProperty.top = 0;
        dialogProperty.left = 0;
        dialogProperty.right = 0;
        dialogProperty.bottom = 0;
    }

    dialog.css(dialogProperty);
}

var config = {
    setLesionNumberCallback: setLesionNumberCallback,
    getLesionLocationCallback: getLesionLocationCallback,
    changeLesionLocationCallback: changeLesionLocationCallback
};

cornerstoneTools.nonTarget.setConfiguration(config);

Template.nonTargetLesionDialog.events({
    'click #nonTargetLesionOK': function() {
        var dialog = Template.nonTargetLesionDialog.dialog;
        var measurementData = Template.nonTargetLesionDialog.measurementData;

        // Find the select option box
        var selectorLocation = dialog.find("select#selectNonTargetLesionLocation");
        var selectorResponse = dialog.find("select#selectNonTargetLesionLocationResponse");

        // Get the current value of the selector
        var selectedOptionId = selectorLocation.find("option:selected").val();
        var responseOptionId = selectorResponse.find("option:selected").val();

        // If the selected option is still the default (-1)
        // then stop here
        if (selectedOptionId < 0) {
            return;
        }

        // If the selected response option is still the default (-1)
        // then stop here
        if (responseOptionId < 0) {
            return;
        }

        // Get selected location data
        var locationObj = LesionLocations.findOne({_id: selectedOptionId});

        var id;
        var existingLocation = PatientLocations.findOne({location: locationObj.location});
        if (existingLocation) {
            id = existingLocation._id;
        } else {
            // Adds location data to PatientLocation and retrieve the location ID
            id = PatientLocations.insert({location: locationObj.location});
        }

        if (!measurementData.id) {
            // Add an ID value to the tool data to link it to the Measurements collection
            measurementData.id = 'notready';

            // Link locationUID with active lesion measurementData
            measurementData.locationUID = id;

            /// Set the isTarget value to true, since this is the target-lesion dialog callback
            measurementData.isTarget = false;

            // measurementText is set from location response list
            measurementData.measurementText = responseOptionId;

            // Adds lesion data to timepoints array
            measurementManagerDAL.addLesionData(measurementData);
        } else {
            Measurements.update(measurementData.id, {
                $set: {
                    location: locationObj.location,
                    locationId: locationObj.id,
                    locationUID: id
                }
            });
        }

        // Close the dialog
        closeHandler(dialog);
    },
    'click #removeLesion': function() {
        var measurementData = Template.nonTargetLesionDialog.measurementData;
        var doneCallback = Template.nonTargetLesionDialog.doneCallback;
        var dialog = Template.nonTargetLesionDialog.dialog;

        if (doneCallback && typeof doneCallback === 'function') {
            var deleteTool = true;
            doneCallback(measurementData, deleteTool);
        }

        closeHandler(dialog);
    },
    'click #btnCloseLesionPopup': function() {
        var dialog = Template.nonTargetLesionDialog.dialog;
        closeHandler(dialog);
    },
    'keypress #lesionLocationDialog, keypress #lesionLocationRelabelDialog': function(e) {
        var dialog = Template.nonTargetLesionDialog.dialog;

        // If Enter is pressed, close the dialog
        if (e.which === 13) {
            closeHandler(dialog);
        }
    }
});


Template.nonTargetLesionDialog.helpers({
    'lesionLocations': function() {
        return LesionLocations.find();
    },
    'locationResponses': function() {
        return LocationResponses.find();
    }
});