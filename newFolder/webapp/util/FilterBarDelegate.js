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

    // Standard MDC pattern (matches the official FilterbarTypes demo sample):
    // addItem() creates a SEPARATE FilterField instance for the p13n dialog panel,
    // identified by a stable "--filter--" ID so repeated calls return the same instance.
    //
    // We do NOT return the XML-declared fields (idJobNameFilter etc.) here.
    // A SAPUI5 element can only live in one aggregation at a time — returning a field
    // that is already in filterItems causes MDC to move it into the dialog panel,
    // disconnecting it from the FilterBar so any input entered in the dialog is lost.
    //
    // The XML fields stay permanently in filterItems (FilterBar display).
    // The delegate-created fields live in the dialog panel context.
    // Both sets bind to the same $filters>/conditions/<key> path, so they share state.
    FilterBarDelegateImpl.addItem = async function (oFilterBar, sPropertyKey) {
        const sName = (sPropertyKey && typeof sPropertyKey === "object")
            ? (sPropertyKey.name || sPropertyKey.key) : sPropertyKey;

        const sId = oFilterBar.getId() + "--filter--" + sName;

        // Reuse a previously created instance if it still exists in the UI5 registry
        const oCore = sap.ui.getCore ? sap.ui.getCore() : null;
        const oExisting = oCore && typeof oCore.byId === "function" ? oCore.byId(sId) : null;
        if (oExisting) {
            return oExisting;
        }

        const oProperty = _aProperties.find(function (p) { return p.name === sName; });
        if (!oProperty) { return null; }

        return new FilterField(sId, {
            propertyKey: sName,
            conditions: "{$filters>/conditions/" + sName + "}",
            dataType: oProperty.dataType,
            label: oProperty.label,
            maxConditions: oProperty.maxConditions,
            required: !!oProperty.required,
            delegate: { name: "sap/ui/mdc/field/FieldBaseDelegate", payload: {} }
        });
    };

    // Delegate-created fields (--filter-- ID) are destroyed on removal.
    // XML-declared fields are left alive — they stay in the view's filterItems.
    FilterBarDelegateImpl.removeItem = async function (oFilterBar, oFilterField) {
        const sId = typeof oFilterField.getId === "function" ? oFilterField.getId() : "";
        if (sId.indexOf("--filter--") !== -1) {
            oFilterField.destroy();
        }
        return true;
    };

    return FilterBarDelegateImpl;
});
