/*global $ _ BitwiseInt */
/*global get has */

(function () {
  'use strict';

  this.define([
    'backbone',
    'hbs!tmpl/RangeFilterTemplate',
    'hbs!tmpl/BitmaskFilterTemplate',
    'viresFilters',
    'd3',
    'graphly'
  ],
  function (
    backbone,
    RangeFilterTmpl,
    BitmaskFilterTmpl,
    viresFilters
  ) {


    // Data types used by the rage filters.

    var FloatType = {
      pattern: /^[-+]?([0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?|Infinity)$/,
      isCoparable: true,
      parseValue: function (source) {
        return FloatType.pattern.test(source) ? Number(source) : null;
      },
      isValid: function (value) {
        return typeof value === 'number';
      },
    };


    var getFancyName = function (name) {
      var parts = name.split("_");
      if (parts.length > 1) {
        name = parts[0];
        for (var i = 1; i < parts.length; i++) {
          name += (" " + parts[i]).sub();
        }
      }
      return name;
    };


    var RangeFilterModel = backbone.Model.extend({
      dataType: FloatType,
      defaults: {
        type: null,
        id: null,
        lowerBound: NaN,
        upperBound: NaN,
        parameters: null,
        tabIndex: 0
      },
      toFilter: function () {
        var attr = this.attributes;
        return viresFilters.createRangeFilter(attr.lowerBound, attr.upperBound);
      },
      validate: function (attrs) {
        if (!this.dataType.isValid(attrs.lowerBound)) {
          return "Invalid lower bound value!";
        }
        if (!this.dataType.isValid(attrs.upperBound)) {
          return "Invalid upper bound value!";
        }
        if (this.dataType.isCoparable && (attrs.lowerBound > attrs.upperBound)) {
          return "The lower bound is larger than the upper one!";
        }
      }
    });


    var RangeFilterView = backbone.View.extend({
      template: RangeFilterTmpl,
      tagName: "div",
      className: "input-group",
      attributes: {
        "style": "margin:7px"
      },
      formatValue: function (value) {
        return value.toFixed(2);
      },
      roundValue: function (value) {
        return Number(this.formatValue(value));
      },
      initialize: function (options) {
        if (has(options, "dataType")) {
          this.model.dataType = options.dataType;
        }
        this.model = new RangeFilterModel({
          type: options.filter.type,
          id: options.id,
          lowerBound: this.roundValue(options.filter.lowerBound),
          upperBound: this.roundValue(options.filter.upperBound),
          parameters: options.parameters,
          tabIndex: get(options, "tabIndex", 0)
        });
        this.listenTo(this.model, "change", this.render);
      },
      getTabCount: function () {
        return 3;
      },
      events: {
        "change textarea": "onTextAreaChange"
      },
      render: function () {
        var attr = this.model.attributes;
        var lowerBoundIsValid = this.model.dataType.isValid(attr.lowerBound);
        var upperBoundIsValid = this.model.dataType.isValid(attr.upperBound);
        if (lowerBoundIsValid && lowerBoundIsValid && !this.model.isValid()) {
          lowerBoundIsValid = upperBoundIsValid = false;
        }
        this.$el.html(this.template({
          id: attr.id,
          name: getFancyName(attr.id),
          type: attr.type,
          lowerBound: lowerBoundIsValid ? this.formatValue(attr.lowerBound) : attr.lowerBound,
          upperBound: upperBoundIsValid ? this.formatValue(attr.upperBound) : attr.upperBound,
          lowerBoundIsValid: lowerBoundIsValid,
          upperBoundIsValid: upperBoundIsValid,
          index1: attr.tabIndex + 0,
          index2: attr.tabIndex + 1,
          index3: attr.tabIndex + 2
        }));
      },
      onTextAreaChange: function (event) {
        var $input = $(event.target);
        var sourceValue = $input.val();
        sourceValue = sourceValue.split(/\r?\n/)[0]; // parse first line only
        sourceValue = sourceValue.trim(); // get rid of excessive white-spaces
        var parsedValue = this.model.dataType.parseValue(sourceValue);
        this.model.set($input.attr("id"), parsedValue == null ? sourceValue : this.roundValue(parsedValue));
        // re-render even if the model has not changed
        if (_.isEmpty(this.model.changed)) {
          this.render();
        }
      }
    });


    var BitmaskFilterModel = backbone.Model.extend({
      defaults: {
        type: null,
        id: null,
        size: 0,
        mask: 0,
        selection: 0,
        parameters: null,
        tabIndex: 0
      },
      toFilter: function () {
        var attr = this.attributes;
        return viresFilters.createBitmaskFilter(attr.size, attr.mask, attr.selection);
      },
      validate: function (attr) {
        if (BitwiseInt.fromNumber(attr.mask).toNumber() !== attr.mask) {
          return "Invalid bit mask value.";
        }
        if (BitwiseInt.fromNumber(attr.selection).toNumber() !== attr.selection) {
          return "Invalid bit selection value.";
        }
      }
    });


    var BitmaskFilterView = backbone.View.extend({
      template: BitmaskFilterTmpl,
      tagName: "div",
      className: "input-group",
      attributes: {
        "style": "margin:7px"
      },
      initialize: function (options) {
        var mask = BitwiseInt.fromNumber(options.filter.mask);
        var selection = BitwiseInt.fromNumber(options.filter.selection);
        this.model = new BitmaskFilterModel({
          type: options.filter.type,
          id: options.id,
          size: options.filter.size,
          mask: mask.toNumber(),
          selection: selection.and(mask).toNumber(),
          parameters: options.parameters,
          tabIndex: get(options, "tabIndex", 0)
        });
        this.listenTo(this.model, "change", this.render);
      },
      getTabCount: function () {
        return this.model.get('size');
      },
      events: {
        "click .checkbox-control": "onCheckboxOverlayClick"
      },
      render: function () {
        var keys = [
          "index", "rendered", "enabled", "selected", "label", "info",
          "tabIndex", "insertSeparator"
        ];
        var attr = this.model.attributes;

        var gapBefore = [];
        for (var i = 0, lastNotGap = -1; i < attr.size; ++i) {
          var isNotGap = attr.parameters.bitmask.flags[i][0] != null;
          gapBefore.push(isNotGap && i - lastNotGap > 1);
          if (isNotGap) lastNotGap = i;
        }

        this.$el.html(this.template({
          id: attr.id,
          name: getFancyName(attr.id),
          type: attr.type,
          mask: attr.mask,
          selection: attr.selection,
          bits: _.map(
            _.zip(
              _.range(attr.size),
              _.map(attr.parameters.bitmask.flags, function (item) {return item[0] != null;}),
              BitwiseInt.fromNumber(attr.mask).toBoolArray(attr.size),
              BitwiseInt.fromNumber(attr.selection).toBoolArray(attr.size),
              _.map(attr.parameters.bitmask.flags, function (item) {return item[0];}),
              _.map(attr.parameters.bitmask.flags, function (item) {return item[1];}),
              _.range(attr.tabIndex, attr.tabIndex + attr.size),
              gapBefore
            ),
            function (item) {return _.object(keys, item);}
          ),
        }));
      },
      onCheckboxOverlayClick: function (event) {
        var enabled = BitwiseInt.fromNumber(this.model.get('mask'));
        var selected = BitwiseInt.fromNumber(this.model.get('selection'));
        var bitIndex = Number($(event.target).data().bitIndex);
        var isEnabled = enabled.getBit(bitIndex);
        var isSelected = selected.getBit(bitIndex);
        if (!isEnabled) { // disabled -> not selected
          isEnabled = true;
          isSelected = false;
        } else if (!isSelected) { // not selected -> selected
          isEnabled = true;
          isSelected = true;
        } else { // selected -> disabled
          isEnabled = false;
          isSelected = false;
        }
        this.model.set({
          mask: enabled.setBit(bitIndex, isEnabled).toNumber(),
          selection: selected.setBit(bitIndex, isSelected).toNumber()
        });
      },
    });


    return {
      FloatType: FloatType,
      RangeFilterModel: RangeFilterModel,
      RangeFilterView: RangeFilterView,
      BitmaskFilterModel: BitmaskFilterModel,
      BitmaskFilterView: BitmaskFilterView,
    };
  });

}).call(this);
