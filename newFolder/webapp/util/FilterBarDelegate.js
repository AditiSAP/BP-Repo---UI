sap.ui.define([
    "sap/ui/mdc/FilterBarDelegate",
    "sap/ui/mdc/FilterField"
], function (FilterBarDelegate, FilterField) {
    "use strict";

    const FilterBarDelegateImpl = Object.assign({}, FilterBarDelegate);

    const _aProperties = [
        { name: "jobname",   label: "Job Name",    dataType: "sap.ui.model.type.String", maxConditions: 1 },
        { name: "dateRange", label: "Date",        dataType: "sap.ui.model.type.Date",   maxConditions: 1, required: true },
        { name: "createdby", label: "Created By",  dataType: "sap.ui.model.type.String", maxConditions: 1 },
        { name: "status",    label: "Status",      dataType: "sap.ui.model.type.String", maxConditions: -1 },
        { name: "fcYear",    label: "Fiscal Year", dataType: "sap.ui.model.type.String", maxConditions: 1, constraints: { maxLength: 4 } },
        { name: "fcPeriod",  label: "Period",      dataType: "sap.ui.model.type.String", maxConditions: 1, constraints: { maxLength: 3 } }
    ];

    FilterBarDelegateImpl.fetchProperties = function (/* oFilterBar */) {
        return Promise.resolve(_aProperties);
    };

    // MDC calls addItem() when it needs a FilterField instance for a given property key —
    // both during p13n dialog initialisation and when the user re-adds a hidden filter.
    // We first try to return the pre-declared XML field (found by propertyKey); only if
    // it is gone (user hid it) do we create a plain new FilterField.
    FilterBarDelegateImpl.addItem = async function (oFilterBar, sPropertyKey) {
        // sPropertyKey may be a string or an object in different MDC versions
        const sName = (sPropertyKey && typeof sPropertyKey === "object")
            ? (sPropertyKey.name || sPropertyKey.key) : sPropertyKey;

        // Return the existing XML-declared FilterField if available
        const aItems = typeof oFilterBar.getFilterItems === "function"
            ? oFilterBar.getFilterItems() : [];
        const oExisting = aItems.find(function (oField) {
            return typeof oField.getPropertyKey === "function"
                && oField.getPropertyKey() === sName;
        });
        if (oExisting) {
            return oExisting;
        }

        // Fallback: create a new FilterField (e.g. user removed it and re-adds from dialog)
        const oProperty = _aProperties.find(function (p) { return p.name === sName; });
        if (!oProperty) { return null; }

        return new FilterField(oFilterBar.getId() + "--filter--" + sName, {
            propertyKey: sName,
            conditions: "{$filters>/conditions/" + sName + "}",
            dataType: oProperty.dataType,
            label: oProperty.label,
            maxConditions: oProperty.maxConditions,
            required: !!oProperty.required,
            delegate: { name: "sap/ui/mdc/field/FieldBaseDelegate", payload: {} }
        });
    };

    // Destroy only programmatically-created fields (those with "--filter--" in the ID).
    // XML-declared fields use custom IDs and should not be destroyed — they would be
    // unrecoverable (ValueHelp wiring is lost).
    FilterBarDelegateImpl.removeItem = async function (oFilterBar, oFilterField) {
        const sId = typeof oFilterField.getId === "function" ? oFilterField.getId() : "";
        if (sId.indexOf("--filter--") !== -1) {
            oFilterField.destroy();
        }
        return true;
    };

    return FilterBarDelegateImpl;
});
