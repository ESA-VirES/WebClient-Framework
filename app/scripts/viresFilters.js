/* global BitwiseInt */

(function () {
  'use strict';

  var dependencies = [
    'd3',
    'graphly',
  ];

  function init() {

    var createRangeFilter = function (lowerBound, upperBound) {
      return {
        type: "RangeFilter",
        lowerBound: lowerBound,
        upperBound: upperBound
      };
    };

    var createBitmaskFilter = function (size, mask, selection) {
      return {
        type: "BitmaskFilter",
        size: size,
        mask: mask,
        selection: selection
      };
    };

    var filterFunctionFactory = {
      "RangeFilter": function (filter) {
        var lowerBound = filter.lowerBound;
        var upperBound = filter.upperBound;
        return function (value) {
          return lowerBound <= value && value <= upperBound;
        };
      },
      "BitmaskFilter": function (filter) {
        if (filter.mask != 0) {
          var mask = BitwiseInt.fromNumber(filter.mask);
          var selection = BitwiseInt.fromNumber(filter.selection).and(mask);
          return function (value) {
            return BitwiseInt.fromNumber(value).and(mask).equals(selection);
          };
        }
      },
    };

    var getFilterFunction = function (filter) {
      return filterFunctionFactory[filter.type](filter);
    };

    var filterFormatter = {
      "RangeFilter": function (variable, filter) {
        return [variable, ">=", filter.lowerBound, "AND", variable, "<=", filter.upperBound].join(" ");
      },
      "BitmaskFilter": function (variable, filter) {
        var mask = BitwiseInt.fromNumber(filter.mask);
        var selection = BitwiseInt.fromNumber(filter.selection);
        return [variable, "&", mask.toNumber(), "==", selection.and(mask).toNumber()].join(" ");
      },
    };

    var formatFilter = function (variable, filter) {
      return filterFormatter[filter.type](variable, filter);
    };

    var joinFormattedFilters = function (formattedFilters) {
      return formattedFilters.join(" AND ");
    };

    return {
      createRangeFilter: createRangeFilter,
      createBitmaskFilter: createBitmaskFilter,
      getFilterFunction: getFilterFunction,
      formatFilter: formatFilter,
      joinFormattedFilters: joinFormattedFilters
    };
  }

  this.define(dependencies, init);
}).call(this);
