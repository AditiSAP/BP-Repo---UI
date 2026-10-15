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

    // Preserved references to the XML-declared FilterField instances.
    // When a field is removed from filterItems (user hides it), it is NOT destroyed —
    // it is kept here so re-adding (user shows it again) returns the same instance
    // with its ValueHelp and operator configuration intact.
    const _mOriginalFields = {};

    FilterBarDelegateImpl.fetchProperties = function () {
        return Promise.resolve(_aProperties);
    };

    // addItem() is called by MDC's p13n Engine whenever it needs a FilterField
    // instance for a property — during dialog initialisation AND when the user
    // re-enables a hidden filter.
    //
    // Returning the XML-declared field (rather than a freshly created one) keeps
    // the Engine in sync with the filterItems aggregation: it registers the SAME
    // instance the FilterBar already has, so the Engine's active-item count matches
    // filterItems and the "Select All" checkbox becomes operational.
    FilterBarDelegateImpl.addItem = async function (oFilterBar, sPropertyKey) {
        const sName = (sPropertyKey && typeof sPropertyKey === "object")
            ? (sPropertyKey.name || sPropertyKey.key) : sPropertyKey;

        // 1. XML-declared field is currently in filterItems — return it and cache it.
        const aItems = typeof oFilterBar.getFilterItems === "function"
            ? oFilterBar.getFilterItems() : [];
        const oInBar = aItems.find(function (oField) {
            return typeof oField.getPropertyKey === "function"
                && oField.getPropertyKey() === sName;
        });
        if (oInBar) {
            _mOriginalFields[sName] = oInBar;
            return oInBar;
        }

        // 2. Field was previously removed (user hid it). Return the cached original
        //    so ValueHelp wiring and custom operators are preserved on re-add.
        const oCached = _mOriginalFields[sName];
        if (oCached && !oCached.bIsDestroyed) {
            return oCached;
        }

        // 3. No XML field available (destroyed or never existed). Fall back to a
        //    plain programmatic FilterField keyed by the standard ID pattern.
        const sId = oFilterBar.getId() + "--filter--" + sName;
        const oCore = sap.ui.getCore ? sap.ui.getCore() : null;
        const oPrev = oCore && typeof oCore.byId === "function" ? oCore.byId(sId) : null;
        if (oPrev) { return oPrev; }

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

    // XML-declared fields are NOT destroyed — they are kept in _mOriginalFields so
    // they can be returned by addItem() if the user re-enables them, preserving
    // ValueHelp and operator config. Only programmatically-created fallback fields
    // (whose IDs contain "--filter--") are destroyed.
    FilterBarDelegateImpl.removeItem = async function (oFilterBar, oFilterField) {
        const sId = typeof oFilterField.getId === "function" ? oFilterField.getId() : "";
        if (sId.indexOf("--filter--") !== -1) {
            oFilterField.destroy();
            Object.keys(_mOriginalFields).forEach(function (k) {
                if (_mOriginalFields[k] === oFilterField) { delete _mOriginalFields[k]; }
            });
        }
        return true;
    };

    return FilterBarDelegateImpl;
});
