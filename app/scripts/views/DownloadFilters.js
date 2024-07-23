/*global $ _ BitwiseInt */
/*global get has */
/*global padLeft */

(function () {
  'use strict';

  this.define([
    'backbone',
    'hbs!tmpl/RangeFilterTemplate',
    'hbs!tmpl/DateRangeFilterTemplate',
    'hbs!tmpl/BitmaskFilterTemplate',
    'hbs!tmpl/DurationFilterTemplate',
    'viresFilters',
    'd3',
    'graphly'
  ],
  function (
    backbone,
    RangeFilterTmpl,
    DateRangeFilterTmpl,
    BitmaskFilterTmpl,
    DurationFilterTmpl,
    viresFilters
  ) {

    // integer division - helper function
    var _intDiv = function (x, y) {return Math.floor(x / y);};

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

    // ------------------------------------------------------------------------
    // Data types used by the rage filters.

    var FloatType = {
      pattern: /^[-+]?([0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?|Infinity)$/,
      isComparable: true,
      parseValue: function (source) {
        return FloatType.pattern.test(source) ? Number(source) : null;
      },
      isValid: function (value) {
        return typeof value === 'number';
      },
      formatValue: function (value) {
        return value.toFixed(2);
      },
      transformValue: function (value) {
        return Number(this.formatValue(value));
      },
    };


    var DateType = {
      // date stored as number of whole days since 1970-01-01 (Unix epoch)
      minValue: -25567, // 1900-01-01
      maxValue: 47481, // 2099-12-31
      pattern: /^(19|20)[0-9][0-9]-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/,
      monthDays: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
      isComparable: true,
      parseValue: function (source) {
        var parts = this.stringToParts(source);
        if (parts) {return this.partsToDayUnix(parts);}
        return null;
      },
      isValid: function (value) {
        return (
          (typeof value === 'number') &&
          (value >= DateType.minValue) &&
          (value <= DateType.maxValue)
        );
      },
      formatValue: function (value) {
        if (this.isValid(value)) {
          return this.partsToString(this.dayUnixToParts(value));
        }
        return String(value);
      },
      transformValue: function (value) {
        return Math.floor(value);
      },
      fromUTCDate: function (date) {
        return _intDiv(date.getTime(), 86400000);
      },
      toUTCDate: function (value) {
        return new Date(value * 86400000);
      },
      stringToParts: function (dateString) {
        // convert date string YYYY-MM-DD
        // to an object of the corresponding year, month and day parts
        if (!DateType.pattern.test(dateString)) {return null;}
        var partsDate = dateString.split("-");
        var parts = {
          year: Number(partsDate[0]),
          month: Number(partsDate[1]),
          day: Number(partsDate[2]),
        };
        var maxMonthDays = (
          this.monthDays[parts.month - 1]
          + (parts.month == 2 && this.isLeapYear(parts.year))
        );
        if (parts.day > maxMonthDays) {return null;}
        return parts;
      },
      partsToString: function (parts) {
        // convert object of year, month and day parts
        // to an ISO date string YYYY-MM-DD
        return [
          padLeft(String(parts.year), "0", 4),
          padLeft(String(parts.month), "0", 2),
          padLeft(String(parts.day), "0", 2),
        ].join("-");
      },
      partsToDayUnix: function (parts) {
        // convert date parts (year, month, date)
        // to an integer number of days since 1970-01-01
        // ref: https://en.wikipedia.org/wiki/Julian_day#Converting_Julian_or_Gregorian_calendar_date_to_Julian_day_number
        // ref: http://www.cs.utsa.edu/~cs1063/projects/Spring2011/Project1/jdn-explanation.html
        // only Gregorian calendar is considered
        var tmp = _intDiv(14 - parts.month, 12);
        var years = parts.year + 4800 - tmp;
        var months = parts.month + 12 * tmp - 3;
        return (
          parts.day + _intDiv(153 * months + 2, 5) + 365 * years
          + _intDiv(years, 4) + _intDiv(years, 400) - _intDiv(years, 100)
          - 2472633
        );
      },
      dayUnixToParts: function (dayUnix) {
        // convert integer number of days since 1970-01-01
        // to date parts (year, month, date)
        // ref: https://en.wikipedia.org/wiki/Julian_day#Julian_or_Gregorian_calendar_from_Julian_day_number
        // only Gregorian calendar is considered
        //var tmp1 = Math.floor(dayUnix) + 2451545;
        var tmp1 = Math.floor(dayUnix) + 2440588;
        var tmp2 = tmp1 + 1363 + _intDiv(_intDiv(4 * tmp1 + 274277, 146097) * 3, 4);
        var tmp3 = 4 * tmp2 + 3;
        var tmp4 = 5 * _intDiv(tmp3 % 1461, 4) + 2;
        var day = 1 + _intDiv(tmp4 % 153, 5);
        var month = 1 + (_intDiv(tmp4, 153) + 2) % 12;
        var year = _intDiv(tmp3, 1461) + _intDiv(14 - month, 12) - 4716;
        return {year: year, month: month, day: day};
      },
      isLeapYear: function (year) {
        return (year % 4 === 0) && ((year % 100 !== 0) || (year % 400 === 0));
      },
    };


    var TimeType = {
      minValue: 0,
      maxValue: 86400000 - 1,
      pattern: /^([01][0-9]|2[0-3])(:[0-5][0-9](:[0-5][0-9](\.[0-9]*)?)?)?$/,
      isComparable: true,
      parseValue: function (source) {
        var parts = this.stringToParts(source);
        if (parts) {return this.partsToMilliseconds(parts);}
        if (source === "24") {return TimeType.maxValue;}
        return null;
      },
      isValid: function (value) {
        return (
          (typeof value === 'number') &&
          (value >= TimeType.minValue) &&
          (value <= TimeType.maxValue)
        );
      },
      formatValue: function (value) {
        if (this.isValid(value)) {
          return this.partsToString(this.millisecondsToParts(value));
        }
        return String(value);
      },
      transformValue: function (value) {
        return Math.trunc(value);
      },
      setUTCHoursFromParts: function (dateObj, parts) {
        // set UTC time of a date object
        dateObj.setUTCHours(parts.hours, parts.minutes, parts.seconds, parts.milliseconds);
        return dateObj;
      },
      setUTCHoursFromMilliseconds: function (dateObj, milliseconds) {
        // set UTC time from milliseconds since midnight
        return this.setUTCHoursFromParts(dateObj, this.millisecondsToParts(milliseconds));
      },
      stringToParts: function (timeString) {
        // convert time string hh:mm:ss.sss to an object of the corresponding
        // hours, minutes, seconds and milliseconds
        if (!TimeType.pattern.test(timeString)) {return null;}
        var partsTime = (timeString + "::").split(":");
        var partsSeconds = (partsTime[2] + ".").split(".");
        return {
          hours: Number(partsTime[0]),
          minutes: Number(partsTime[1]),
          seconds: Number(partsSeconds[0]),
          milliseconds: Number((partsSeconds[1] + "000").slice(0, 3)),
        };
      },
      millisecondsToParts: function (milliseconds) {
        // convert time as number of milliseconds since midnight to an object
        // of the corresponding hours, minutes, seconds and milliseconds
        return {
          hours: Math.trunc((milliseconds % 86400000) / 3600000),
          minutes: Math.trunc((milliseconds % 3600000) / 60000),
          seconds: Math.trunc((milliseconds % 60000) / 1000),
          milliseconds: Math.trunc(milliseconds % 1000),
        };
      },
      partsToString: function (parts) {
        // convert an object of hours, minutes, seconds and milliseconds
        // to a time string hh:mm:ss.sss
        return [
          padLeft(String(parts.hours), "0", 2), ":",
          padLeft(String(parts.minutes), "0", 2), ":",
          padLeft(String(parts.seconds), "0", 2), ".",
          padLeft(String(parts.milliseconds), "0", 3)
        ].join("");
      },
      partsToMilliseconds: function (parts) {
        // convert an object of hours, minutes, seconds and milliseconds
        // to a number of milliseconds since midnight
        return (
          parts.hours * 3600000 +
          parts.minutes * 60000 +
          parts.seconds * 1000 +
          parts.milliseconds
        );
      },
    };


    var DurationType = {
      pattern: /^P([0-9]+Y)?([0-9]+M)?([0-9]+D)?(?:(T)([0-9]+H)?([0-9]+M)?((?:[0-9]+(\.[0-9]*)?|\.[0-9]+)S)?)?$/,
      comparable: false,
      parseValue: function (source) {
        return this.stringToParts(source);
      },
      isValid: function (value) {
        return typeof value === 'object';
      },
      formatValue: function (value) {
        if (this.isValid(value)) {
          return this.partsToString(value);
        }
        return String(value);
      },
      transformValue: function (value) {
        return this.normalizeParts(value);
      },
      stringToParts: function (durationString) {
        // convert ISO duration string to years, months, days, hours, minutes,
        // seconds and milliseconds parts
        var match = durationString.match(this.pattern);
        if (!match) {return null;}
        var hasDatePart = match[1] || match[2] || match[3];
        var hasTimePart = match[5] || match[6] || match[7];
        var hasTimeSeparator = match[4] === "T";
        if ((!hasDatePart || hasTimeSeparator) && !hasTimePart) {return null;}
        var _parseValue = function (string) {
          return string ? Number(string.slice(0, -1)) : 0;
        };
        var partsSeconds = (function (string) {
          var parts = string ? (string.slice(0, -1) + ".").split(".") : ["", ""];
          return {
            seconds: Number(parts[0] || 0),
            milliseconds: Number((parts[1] + "000").slice(0, 3)),
          };
        }).call(this, match[7]);
        return {
          years: _parseValue(match[1]),
          months: _parseValue(match[2]),
          days: _parseValue(match[3]),
          hours: _parseValue(match[5]),
          minutes: _parseValue(match[6]),
          seconds: partsSeconds.seconds,
          milliseconds: partsSeconds.milliseconds,
        };
      },
      partsToString: function (parts) {
        // convert years, months, days, hours, minutes, seconds and milliseconds
        // parts to ISO duration string
        var totalMilliseconds = Math.trunc(
          (parts.seconds ? parts.seconds : 0) * 1000 +
          (parts.milliseconds ? parts.milliseconds : 0)
        );
        var seconds = Math.trunc(totalMilliseconds / 1000);
        var milliseconds = totalMilliseconds % 1000;
        var datePart = [
          parts.years ? String(parts.years) + "Y" : "",
          parts.months ? String(parts.months) + "M" : "",
          parts.days ? String(parts.days) + "D" : "",
        ].join("");
        var timePart = [
          parts.hours ? String(parts.hours) + "H" : "",
          parts.minutes ? String(parts.minutes) + "M" : "",
          totalMilliseconds != 0 ? (
            String(seconds) + (
              milliseconds != 0 ? "." + String(milliseconds).replace(/0+$/, "") : ""
            ) + "S"
          ) : "",
        ].join("");
        if (timePart) {
          return ["P", datePart, "T", timePart].join("");
        }
        if (datePart) {
          return "P" + datePart;
        }
        return "PT0S";
      },
      normalizeParts: function (parts) {
        // normalize day, hours, minutes and milliseconds parts
        // years and months remain unchanged
        var tmp;
        parts = {
          years: get(parts, "years", 0),
          months: get(parts, "months", 0),
          days: get(parts, "days", 0),
          hours: get(parts, "hours", 0),
          minutes: get(parts, "minutes", 0),
          seconds: get(parts, "seconds", 0),
          milliseconds: get(parts, "milliseconds", 0),
        };
        // get rid of decimal fractions
        tmp = Math.floor(parts.days);
        parts.hours += (parts.days - tmp) * 24;
        parts.days = tmp;
        tmp = Math.floor(parts.hours);
        parts.minutes += (parts.hours - tmp) * 60;
        parts.hours = tmp;
        tmp = Math.floor(parts.minutes);
        parts.seconds += (parts.minutes - tmp) * 60;
        parts.minutes = tmp;
        tmp = Math.floor(parts.seconds);
        parts.milliseconds = Math.floor(parts.milliseconds + (parts.seconds - tmp) * 1000);
        parts.seconds = tmp;
        // get rid of overflows
        tmp = parts.milliseconds % 1000;
        parts.seconds += (parts.milliseconds - tmp) / 1000;
        parts.milliseconds = tmp;
        tmp = parts.seconds % 60;
        parts.minutes += (parts.seconds - tmp) / 60;
        parts.seconds = tmp;
        tmp = parts.minutes % 60;
        parts.hours += (parts.minutes - tmp) / 60;
        parts.minutes = tmp;
        tmp = parts.hours % 24;
        parts.days += (parts.hours - tmp) / 24;
        parts.hours = tmp;
        return parts;
      },
    };

    // ------------------------------------------------------------------------
    // Models used by the rage filters.

    var BaseFilterModel = backbone.Model.extend({
      set: function (key, val, options) {
        // overriding the default set method to implement a hook
        // allowing modification of new values passes to the set() method
        var attrs;
        if (key != null) {
          // handling different styles of inputs
          if (typeof key === 'object') {
            attrs = key;
            options = val;
          } else {
            attrs = {};
            attrs[key] = val;
          }
          attrs = this.transform(attrs, options);
        }
        return backbone.Model.prototype.set.call(this, attrs, options);
      },
      transform: function (attrs, options) {
        // override to modify new values passed to the set() method
        return attrs;
      },
    });


    var RangeFilterModel = BaseFilterModel.extend({
      dataType: FloatType,
      defaults: {
        type: null,
        id: null,
        lowerBound: NaN,
        upperBound: NaN,
        parameters: null,
      },
      toFilter: function () {
        var attrs = this.attributes;
        return viresFilters.createRangeFilter(attrs.lowerBound, attrs.upperBound);
      },
      validate: function (attrs) {
        if (!this.dataType.isValid(attrs.lowerBound)) {
          return "Invalid lower bound value!";
        }
        if (!this.dataType.isValid(attrs.upperBound)) {
          return "Invalid upper bound value!";
        }
        if (this.dataType.isComparable && (attrs.lowerBound > attrs.upperBound)) {
          return "The lower bound is larger than the upper one!";
        }
      },
      transform: function (attrs) {
        var _transformValue = function (key) {
          if (has(attrs, key) && this.dataType.isValid(attrs[key])) {
            attrs[key] = this.dataType.transformValue(attrs[key]);
          }
        };
        _transformValue.call(this, "lowerBound");
        _transformValue.call(this, "upperBound");
        return attrs;
      },
    });


    var DateRangeFilterModel = RangeFilterModel.extend({
      dataType: DateType,
      defaults: {
        type: null,
        id: null,
        lowerBound: 0,
        upperBound: 0,
        parameters: null,
      },
      validate: function (attrs) {
        if (!this.dataType.isValid(attrs.lowerBound)) {
          return "Invalid start date value!";
        }
        if (!this.dataType.isValid(attrs.upperBound)) {
          return "Invalid end date value!";
        }
        if (this.dataType.isComparable && (attrs.lowerBound > attrs.upperBound)) {
          return "The start date is after the end date!";
        }
      },
    });


    var TimeRangeFilterModel = RangeFilterModel.extend({
      dataType: TimeType,
      defaults: {
        type: null,
        id: null,
        lowerBound: TimeType.minValue,
        upperBound: TimeType.maxValue,
        parameters: null,
      },
      validate: function (attrs) {
        // Note that the end time is not required to be after start time.
        if (!this.dataType.isValid(attrs.lowerBound)) {
          return "Invalid start time!";
        }
        if (!this.dataType.isValid(attrs.upperBound)) {
          return "Invalid end time!";
        }
      },
    });


    var BitmaskFilterModel = backbone.Model.extend({
      defaults: {
        type: null,
        id: null,
        size: 0,
        mask: 0,
        selection: 0,
        parameters: null,
      },
      toFilter: function () {
        var attrs = this.attributes;
        return viresFilters.createBitmaskFilter(attrs.size, attrs.mask, attrs.selection);
      },
      validate: function (attrs) {
        if (BitwiseInt.fromNumber(attrs.mask).toNumber() !== attrs.mask) {
          return "Invalid bit mask value.";
        }
        if (BitwiseInt.fromNumber(attrs.selection).toNumber() !== attrs.selection) {
          return "Invalid bit selection value.";
        }
      }
    });


    var DurationFilterModel = BaseFilterModel.extend({
      dataType: DurationType,
      defaults: {
        type: null,
        id: null,
        value: {},
        parameters: null,
      },
      toFilter: null, // not implemented
      validate: function (attrs) {
        if (!this.dataType.isValid(attrs.value)) {
          return "Invalid duration value!";
        }
      },
      transform: function (attrs) {
        var _transformValue = function (key) {
          if (has(attrs, key) && this.dataType.isValid(attrs[key])) {
            attrs[key] = this.dataType.transformValue(attrs[key]);
          }
        };
        _transformValue.call(this, "value");
        return attrs;
      },
    });


    // ------------------------------------------------------------------------
    //  filter views

    var RangeFilterView = backbone.View.extend({
      template: RangeFilterTmpl,
      modelClass: RangeFilterModel,
      tagName: "div",
      className: "input-group",
      attributes: {
        "style": "margin:7px"
      },
      initialize: function (options) {
        if (has(options, "dataType")) {
          this.model.dataType = options.dataType;
        }
        this.label = options.label || getFancyName(options.id);
        this.removable = get(options, "removable", true);
        this.model = new this.modelClass({
          type: options.filter.type,
          id: options.id,
          lowerBound: options.filter.lowerBound,
          upperBound: options.filter.upperBound,
          parameters: options.parameters,
        });
        this.intilialValues = {
          lowerBound: options.filter.lowerBound,
          upperBound: options.filter.upperBound,
        };
        this.listenTo(this.model, "change", this.render);
      },
      events: {
        "change textarea": "onInputChange"
      },
      render: function () {
        var attrs = this.model.attributes;
        var lowerBoundIsValid = this.model.dataType.isValid(attrs.lowerBound);
        var upperBoundIsValid = this.model.dataType.isValid(attrs.upperBound);
        var modelIsValid = this.model.isValid();
        this.$el.html(this.template({
          id: attrs.id,
          name: this.label,
          type: attrs.type,
          removable: this.removable,
          lowerBound: lowerBoundIsValid ? this.model.dataType.formatValue(attrs.lowerBound) : attrs.lowerBound,
          upperBound: upperBoundIsValid ? this.model.dataType.formatValue(attrs.upperBound) : attrs.upperBound,
          lowerBoundIsValid: modelIsValid,
          upperBoundIsValid: modelIsValid,
        }));
      },
      onInputChange: function (event) {
        var $input = $(event.target);
        var id = $input.attr("id");
        var sourceValue = $input.val();
        sourceValue = sourceValue.split(/\r?\n/)[0]; // parse first line only
        sourceValue = sourceValue.trim(); // get rid of excessive white-spaces
        var value = this.model.dataType.parseValue(sourceValue);
        if (value === null) {
          value = sourceValue === "" ? this.intilialValues[id] : sourceValue;
        }
        this.model.set(id, value);
        // re-render even if the model has not changed
        if (_.isEmpty(this.model.changed)) {
          this.render();
        }
      }
    });


    var DateRangeFilterView = RangeFilterView.extend({
      template: DateRangeFilterTmpl,
      modelClass: DateRangeFilterModel,
      events: {
        "change input[type=text]": "onInputChange"
      },

      render: function () {
        RangeFilterView.prototype.render.call(this);

        // initialize datepicker
        $.datepicker.setDefaults({
          showOn: "both",
          dateFormat: "yy-mm-dd",
          minDate: DateType.toUTCDate(DateType.minValue),
          maxDate: DateType.toUTCDate(DateType.maxValue),
        });

        var attrs = this.model.attributes;

        var $lowerBound = this.$("#lowerBound");
        $lowerBound.datepicker();
        if (this.model.dataType.isValid(attrs.lowerBound)) {
          $lowerBound.datepicker("setDate", this.model.dataType.formatValue(attrs.lowerBound));
        }

        var $upperBound = this.$("#upperBound");
        $upperBound.datepicker();
        if (this.model.dataType.isValid(attrs.lowerBound)) {
          $upperBound.datepicker("setDate", this.model.dataType.formatValue(attrs.upperBound));
        }
      },
    });


    var TimeRangeFilterView = RangeFilterView.extend({
      template: RangeFilterTmpl,
      modelClass: TimeRangeFilterModel,
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
        this.removable = get(options, "removable", true);
        this.model = new BitmaskFilterModel({
          type: options.filter.type,
          id: options.id,
          size: options.filter.size,
          mask: mask.toNumber(),
          selection: selection.and(mask).toNumber(),
          parameters: options.parameters,
        });
        this.listenTo(this.model, "change", this.render);
      },
      events: {
        "click .checkbox-control": "onCheckboxOverlayClick"
      },
      render: function () {
        var keys = [
          "index", "rendered", "enabled", "selected", "label", "info",
          "insertSeparator"
        ];
        var attrs = this.model.attributes;

        var gapBefore = [];
        for (var i = 0, lastNotGap = -1; i < attrs.size; ++i) {
          var isNotGap = attrs.parameters.bitmask.flags[i][0] != null;
          gapBefore.push(isNotGap && i - lastNotGap > 1);
          if (isNotGap) lastNotGap = i;
        }

        this.$el.html(this.template({
          id: attrs.id,
          name: getFancyName(attrs.id),
          type: attrs.type,
          mask: attrs.mask,
          selection: attrs.selection,
          removable: this.removable,
          bits: _.map(
            _.zip(
              _.range(attrs.size),
              _.map(attrs.parameters.bitmask.flags, function (item) {return item[0] != null;}),
              BitwiseInt.fromNumber(attrs.mask).toBoolArray(attrs.size),
              BitwiseInt.fromNumber(attrs.selection).toBoolArray(attrs.size),
              _.map(attrs.parameters.bitmask.flags, function (item) {return item[0];}),
              _.map(attrs.parameters.bitmask.flags, function (item) {return item[1];}),
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


    var DurationFilterView = backbone.View.extend({
      template: DurationFilterTmpl,
      modelClass: DurationFilterModel,
      tagName: "div",
      className: "input-group",
      attributes: {
        "style": "margin:7px"
      },
      initialize: function (options) {
        if (has(options, "dataType")) {
          this.model.dataType = options.dataType;
        }
        this.label = options.label || getFancyName(options.id);
        this.removable = get(options, "removable", true);
        this.model = new this.modelClass({
          type: options.filter.type,
          id: options.id,
          value: options.filter.value,
          parameters: options.parameters,
        });
        this.intilialValues = {
          value: options.filter.value,
        };
        this.listenTo(this.model, "change", this.render);
      },
      events: {
        "change textarea": "onInputChange"
      },
      render: function () {
        var attrs = this.model.attributes;
        var valueIsValid = this.model.dataType.isValid(attrs.value);
        var modelIsValid = this.model.isValid();
        this.$el.html(this.template({
          id: attrs.id,
          name: this.label,
          type: attrs.type,
          removable: this.removable,
          value: valueIsValid ? this.model.dataType.formatValue(attrs.value) : attrs.value,
          valueIsValid: modelIsValid,
        }));
      },
      onInputChange: function (event) {
        var $input = $(event.target);
        var id = $input.attr("id");
        var sourceValue = $input.val();
        sourceValue = sourceValue.split(/\r?\n/)[0]; // parse first line only
        sourceValue = sourceValue.trim(); // get rid of excessive white-spaces
        var value = this.model.dataType.parseValue(sourceValue);
        if (value === null) {
          value = sourceValue === "" ? this.intilialValues[id] : sourceValue;
        }
        this.model.set(id, value);
        // re-render even if the model has not changed
        if (_.isEmpty(this.model.changed)) {
          this.render();
        }
      }
    });

    // ------------------------------------------------------------------------

    return {
      FloatType: FloatType,
      DateType: DateType,
      TimeType: TimeType,
      DurationType: DurationType,
      RangeFilterModel: RangeFilterModel,
      DateRangeFilterModel: DateRangeFilterModel,
      TimeRangeFilterModel: TimeRangeFilterModel,
      DurationFilterModel: DurationFilterModel,
      RangeFilterView: RangeFilterView,
      DateRangeFilterView: DateRangeFilterView,
      TimeRangeFilterView: TimeRangeFilterView,
      BitmaskFilterModel: BitmaskFilterModel,
      BitmaskFilterView: BitmaskFilterView,
      DurationFilterView: DurationFilterView,
    };
  });

}).call(this);
