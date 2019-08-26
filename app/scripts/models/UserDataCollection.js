/*global _ */

(function () {
  'use strict';
  var root = this;
  var dependencies = [
    'backbone',
    'underscore',
  ];

  function init(Backbone) {
    var _dataTypeClassifier = {
      "CDF_EPOCH": "TIMESTAMP",
      "CDF_EPOCH16": "TIMESTAMP",
      "CDF_TIME_TT2000": "TIMESTAMP",
      "CDF_FLOAT": "NUMBER",
      "CDF_DOUBLE": "NUMBER",
      "CDF_REAL8": "NUMBER",
      "CDF_REAL4": "NUMBER",
      "CDF_UINT1": "NUMBER",
      "CDF_UINT2": "NUMBER",
      "CDF_UINT4": "NUMBER",
      "CDF_INT1": "NUMBER",
      "CDF_INT2": "NUMBER",
      "CDF_INT4": "NUMBER",
      "CDF_INT8": "NUMBER",
      "CDF_CHAR": "STRING"
    };

    function _dataTypesCompatible(a, b) {
      return _dataTypeClassifier[a] === _dataTypeClassifier[b];
    }

    function _arraysEqual(a, b) {
      if (a === b) return true;
      if (a == null || a.length == null) return false;
      if (b == null || b.length == null) return false;
      if (a.length != b.length) return false;
      for (var i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }

    function _fieldsCompatible(a, b) {
      return (
        _dataTypesCompatible(a.data_type, b.data_type) &&
        _arraysEqual(a.shape, b.shape)
      );
    }

    function _getVectorBreakdown(fields) {
      // return vector break down hash map
      var vectorBreakdown = {};

      _.each(fields, function (field, variable) {
        // Only one dimensional vectors are supported. Vector size can be
        // arbitrary, i.e., always use shape to get the actual vector size.
        if (field.shape.length != 1) return;
        var size = field.shape[0];
        var components = [];
        if ((variable.slice(0, 5) === "B_NEC") && (size == 3)) {
          var tail = variable.slice(5);
          components = ["B_N" + tail, "B_E" + tail, "B_C" + tail];
        } else {
          for (var i = 1; i <= size; i++) {
            components.push(variable + '_' + i);
          }
        }
        vectorBreakdown[variable] = components;
      });

      return vectorBreakdown;
    }

    function _fetch_wrapper(this_, options) {
      options = options ? _.clone(options) : {};
      _.extend(options, {
        complete: function (data) {
          this_.trigger('fetch:complete');
        },
      });
      return this_.constructor.__super__.fetch.call(this_, options);
    }

    var UserDataModel = Backbone.Model.extend({
    });

    var UserDataCollection = Backbone.Collection.extend({
      model: UserDataModel,

      fetch: function (options) {
        options = options ? _.clone(options) : {};
        return _fetch_wrapper(this, options);
      },

      hasValidUploads: function () {
        // returns true if at least one uploaded file is valid
        return this.find(
          function (item) {return item.get('is_valid');}
        ) !== undefined;
      },

      getValidUploads: function () {
        return this.filter(function (item) {return item.get('is_valid');});
      },

      getCommonFields: function () {
        // merge compatible fields of all datasets
        var commonFields = {};
        this.each(function (model) {
          if (!model.get('is_valid')) return;
          _.each(model.get('fields'), function (field, variable) {
            if (commonFields.hasOwnProperty(variable)) {
              if (!_fieldsCompatible(commonFields['variable'], field)) {
                delete commonFields[variable];
              }
            } else {
              commonFields[variable] = field;
            }
          });
        });
        return commonFields;
      },

      getVectorBreakdown: function () {
        // return hash map of the breakdown of the common vector variables
        return _getVectorBreakdown(this.getCommonFields());
      }

    });

    return {
      UserDataModel: UserDataModel,
      UserDataCollection: UserDataCollection,
    };
  }
  root.define(dependencies, init);
}).call(this);
