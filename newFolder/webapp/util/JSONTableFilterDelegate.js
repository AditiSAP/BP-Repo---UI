sap.ui.define([
    "sap/ui/mdc/FilterBarDelegate",
    "sap/ui/mdc/FilterField",
    "com/bpcfn/jobscheduler/util/JSONPropertyInfo",
    "sap/ui/core/Element"
], function (FilterBarDelegate, FilterField, JSONPropertyInfo, Element) {
    "use strict";

    const JSONTableFilterDelegate = Object.assign({}, FilterBarDelegate);

    const _createFilterField = async function (sId, oProperty) {
        return new FilterField(sId, {
            dataType:      oProperty.dataType,
            conditions:    "{$filters>/conditions/" + oProperty.key + "}",
            propertyKey:   oProperty.key,
            label:         oProperty.label,
            maxConditions: oProperty.maxConditions,
            delegate:      { name: "sap/ui/mdc/field/FieldBaseDelegate", payload: {} }
        });
    };

    JSONTableFilterDelegate._createFilter = async function (sPropertyKey, oFilterBar) {
        const oProperty = JSONPropertyInfo.find(function (oPI) { return oPI.key === sPropertyKey; });
        const sId = oFilterBar.getId() + "--filter--" + sPropertyKey;
        return Element.getElementById(sId) ?? (await _createFilterField(sId, oProperty));
    };

    JSONTableFilterDelegate.addItem = function (oFilterBar, sPropertyKey) {
        return Promise.resolve(this._createFilter(sPropertyKey, oFilterBar));
    };

    return JSONTableFilterDelegate;
}, false);
