sap.ui.define([
    "sap/ui/mdc/FilterBarDelegate",
    "sap/ui/mdc/FilterField"
], function (FilterBarDelegate, FilterField) {
    "use strict";

    const FilterBarDelegateImpl = Object.assign({}, FilterBarDelegate);

    const _aProperties = [
        { name: "jobname",   label: "Job Name",    dataType: "sap.ui.model.type.String", maxConditions: 1 },
        { name: "version",   label: "Version",     dataType: "sap.ui.model.type.String", maxConditions: 1 },
        { name: "dateRange", label: "Date",        dataType: "sap.ui.model.type.Date",   maxConditions: 1, required: true },
        { name: "createdby", label: "Created By",  dataType: "sap.ui.model.type.String", maxConditions: 1 },
        { name: "status",    label: "Status",      dataType: "sap.ui.model.type.String", maxConditions: -1 },
        { name: "fcYear",    label: "Fiscal Year", dataType: "sap.ui.model.type.String", maxConditions: 1, constraints: { maxLength: 4 } },
        { name: "fcPeriod",  label: "Period",      dataType: "sap.ui.model.type.String", maxConditions: 1, constraints: { maxLength: 3 } }
    ];

    // Preserved references to XML-declared FilterField instances.
    // When a field is removed from filterItems (user hides it), it is NOT destroyed —
    // it is kept here so re-adding returns the same instance with ValueHelp intact.
    const _mOriginalFields = {};

    FilterBarDelegateImpl.fetchProperties = function () {
        return Promise.resolve(_aProperties);
    };

    // addItem() is called by MDC's p13n Engine whenever a FilterField instance is
    // needed — during dialog initialisation AND when the user re-enables a hidden
    // filter.  We return the XML-declared field so the Engine registers the SAME
    // instance already in filterItems; this keeps the active-item count consistent
    // and enables the "Select All" checkbox.
    //
    // IMPORTANT: we also pin the $filters ConditionModel directly onto every
    // returned field.  MDC moves the field from filterItems into the dialog panel
    // aggregation while Adapt Filters is open; after the move the field is no longer
    // a descendant of the FilterBar, so the inherited model reference is lost.
    // A model set directly on a control survives aggregation changes, so the
    // conditions binding keeps writing to the ConditionModel regardless of where
    // MDC places the field.
    FilterBarDelegateImpl.addItem = async function (oFilterBar, sPropertyKey) {
        const sName = (sPropertyKey && typeof sPropertyKey === "object")
            ? (sPropertyKey.name || sPropertyKey.key) : sPropertyKey;

        function _pin(oField) {
            if (!oField) { return oField; }
            function doPin() {
                var oCondModel = typeof oFilterBar.getModel === "function"
                    ? oFilterBar.getModel("$filters") : null;
                if (oCondModel && typeof oField.setModel === "function" && !oField.bIsDestroyed) {
                    oField.setModel(oCondModel, "$filters");
                }
            }
            doPin();
            // Race guard: addItem() may be called during XML-view parsing before the
            // FilterBar's onInit() has set the ConditionModel.  If the model is still
            // absent, re-pin once the FilterBar signals it is ready.  This ensures the
            // $filters binding on the field survives being moved into the dialog panel.
            if (typeof oFilterBar.initialized === "function"
                    && !(oFilterBar.getModel && oFilterBar.getModel("$filters"))) {
                oFilterBar.initialized().then(doPin).catch(function () {});
            }
            return oField;
        }

        // 1. XML-declared field is currently in filterItems — return it and cache it.
        const aItems = typeof oFilterBar.getFilterItems === "function"
            ? oFilterBar.getFilterItems() : [];
        const oInBar = aItems.find(function (oField) {
            return typeof oField.getPropertyKey === "function"
                && oField.getPropertyKey() === sName;
        });
        if (oInBar) {
            _mOriginalFields[sName] = oInBar;
            return _pin(oInBar);
        }

        // 2. Field was previously removed (user hid it). Return the cached original
        //    so ValueHelp wiring and custom operators are preserved on re-add.
        const oCached = _mOriginalFields[sName];
        if (oCached && !oCached.bIsDestroyed) {
            return _pin(oCached);
        }

        // 3. No XML field available — fall back to a plain programmatic FilterField.
        const sId = oFilterBar.getId() + "--filter--" + sName;
        const oCore = sap.ui.getCore ? sap.ui.getCore() : null;
        const oPrev = oCore && typeof oCore.byId === "function" ? oCore.byId(sId) : null;
        if (oPrev) { return _pin(oPrev); }

        const oProperty = _aProperties.find(function (p) { return p.name === sName; });
        if (!oProperty) { return null; }

        const oNew = new FilterField(sId, {
            propertyKey: sName,
            conditions: "{$filters>/conditions/" + sName + "}",
            dataType: oProperty.dataType,
            label: oProperty.label,
            maxConditions: oProperty.maxConditions,
            required: !!oProperty.required,
            delegate: { name: "sap/ui/mdc/field/FieldBaseDelegate", payload: {} }
        });
        return _pin(oNew);
    };

    // XML-declared fields are NOT destroyed — they are kept in _mOriginalFields so
    // they can be returned by addItem() on re-add with ValueHelp config intact.
    // Only programmatically-created fallback fields (IDs containing "--filter--")
    // are destroyed.
    // getCurrentState is called by MDC's P13n Engine to snapshot the FilterBar
    // before the Adapt Filters dialog opens.  The Engine uses this snapshot
    // (items + filter) to compute a diff when the user closes the dialog and
    // then passes the new state to applyState.  Without this override the Engine
    // cannot see the custom conditions we set programmatically (KPI drill-down,
    // initializeData) because they may not be in the ConditionModel yet.
    FilterBarDelegateImpl.getCurrentState = function (oFilterBar, oState) {
        const result = oState || {};
        const aItems = [];
        const mFilter = {};
        (oFilterBar.getFilterItems ? oFilterBar.getFilterItems() : []).forEach(function (oField) {
            const sKey = typeof oField.getPropertyKey === "function" ? oField.getPropertyKey() : null;
            if (sKey) {
                aItems.push({ name: sKey });
                const aConds = typeof oField.getConditions === "function"
                    ? (oField.getConditions() || []) : [];
                if (aConds.length) {
                    mFilter[sKey] = aConds;
                }
            }
        });
        result.items  = aItems;
        result.filter = mFilter;
        return result;
    };

    // applyState is called by the P13n Engine after the user clicks GO in the
    // Adapt Filters dialog.  The Engine passes the collected state, which
    // includes conditions the user entered (possibly on shadow-copy fields that
    // are NOT the same instances as in filterItems).
    //
    // The base FilterBarDelegate.applyState updates only the ConditionModel.
    // We additionally call FilterField.setConditions() on the filterItems
    // instances so that _readConditions() can pick them up synchronously in
    // onRefreshData, and so that the filter tokens appear in the main bar.
    FilterBarDelegateImpl.applyState = async function (oFilterBar, oState, bReplace) {
        if (typeof FilterBarDelegate.applyState === "function") {
            try {
                await FilterBarDelegate.applyState.call(
                    FilterBarDelegateImpl, oFilterBar, oState, bReplace);
            } catch (e) {}
        }

        const mFilter = (oState && oState.filter) || {};
        if (!Object.keys(mFilter).length) { return; }

        const mMap = {};
        (oFilterBar.getFilterItems ? oFilterBar.getFilterItems() : []).forEach(function (oField) {
            const sKey = typeof oField.getPropertyKey === "function"
                ? oField.getPropertyKey() : null;
            if (sKey) { mMap[sKey] = oField; }
        });

        Object.keys(mFilter).forEach(function (sKey) {
            const oField = mMap[sKey];
            if (oField && typeof oField.setConditions === "function") {
                oField.setConditions(mFilter[sKey]);
            }
        });
    };

    FilterBarDelegateImpl.removeItem = async function (oFilterBar, oFilterField) {
        const sId = typeof oFilterField.getId === "function" ? oFilterField.getId() : "";

        // Always cache XML-declared fields on removal.  In MDC 1.120 the P13n Engine
        // may NOT call addItem() during dialog init (it only reads fetchProperties()),
        // so _mOriginalFields might be empty the first time the user hides a filter.
        // Caching here ensures the Reset button and subsequent re-adds return the same
        // field instance — with ValueHelp, custom operators, and conditions intact.
        if (sId.indexOf("--filter--") === -1) {
            const sKey = typeof oFilterField.getPropertyKey === "function"
                ? oFilterField.getPropertyKey() : null;
            if (sKey) {
                _mOriginalFields[sKey] = oFilterField;
            }
        }

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
