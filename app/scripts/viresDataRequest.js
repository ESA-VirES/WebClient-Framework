/* global _ */
/* global TIMESTAMP SPACECRAFT_TO_ID */
/* global VECTOR_BREAKDOWN VECTOR_COMPOSITION REVERSE_VECTOR_COMPOSITION */
/* global DERIVED_PARAMETERS REVERSE_DERIVED_PARAMETERS */
/* global get has pop Timer */


(function () {
  'use strict';
  var root = this;
  var dependencies = [
    'globals',
    'msgpack',
    'httpRequest',
    'hbs!tmpl/wps_fetchData',
    'hbs!tmpl/wps_fetchFieldlines',
    'viresFilters',
    'underscore'
  ];

  function init(
    globals, msgpack, httpRequest, wps_fetchDataTmpl, wps_fetchFieldlinesTmpl,
    viresFilters
  ) {

    //var ORBIT_DIRECTION_ASCENDING = +1;
    var ORBIT_DIRECTION_DESCENDING = -1;
    //var ORBIT_DIRECTION_UNDEFINED = 0;

    var latitudeToPeriodicLatitude = function (latitude, orbitDirection) {
      /*
      if (orbitDirection === ORBIT_DIRECTION_DESCENDING) {
          return (latitude < 0.0 ? -180 : +180) - latitude;
      }
      return latitude; // ascending or undefined
      */
      if (orbitDirection === ORBIT_DIRECTION_DESCENDING) {
        return (latitude < 0.0 ? 0 : 360) - latitude;
      }
      return 180 + latitude; // ascending or undefined
    };


    // VirES data object

    function ViresData(rawData) {
      this._checkIfPresent(rawData, this.INFO);
      this._checkIfPresent(rawData, this.TIMESTAMP);
      this.data = rawData;
      this.info = pop(rawData, this.INFO);
      this.size = rawData[this.TIMESTAMP].length;
      this.vectors = {};
    }

    ViresData.prototype = {

      // name of the metadata attribute
      INFO: '__info__',

      // name of the time-stamp variable
      TIMESTAMP: TIMESTAMP,

      isEmpty: function () {
        return this.size < 1;
      },

      forEachRecord: function (action, filter) {
        var data = this.data;

        var getRecord = function (idx) {
          // extract full data record for the given record index
          var record = {};
          for (var key in data) {
            record[key] = data[key][idx];
          }
          record.__index__ = idx;
          return record;
        };

        if (filter.match) { // filter is an object with a match() method
          filter = _.bind(filter.match, filter);
        } else { // filter a function
          filter = filter || function (record) {return true;};
        }

        for (var idx = 0, size = this.size; idx < size; idx++) {
          var record = getRecord(idx);
          if (filter(record)) {
            action(record);
          }
        }
      },

      // check if required attribute is present
      _checkIfPresent: function (data, attribute) {
        if (!has(data, attribute)) {
          throw new Error("Missing mandatory '" + attribute + "' parameter!");
        }
      },

      // get new variable
      _getNewVariable: function (name) {
        if (!has(this.data, name)) {
          this.data[name] = new Array(this.size);
        }
        return this.data[name];
      },

      // new variable registration
      registerNewVariable: function (name, dependencies) {
        _.each(this.info.variables, function (variables, source) {
          var allDependenciesExist = _.all(
            dependencies || [],
            function (name) {return variables.includes(name);}
          );
          if (allDependenciesExist) {
            variables.push(name);
          }
        });
      },

      // new vector breakdown registration
      registerNewVector: function (vector, components) {
        this.vectors[vector] = components;
      },
    };

    // special empty data object
    var emptyViresData = {
      info: null,
      data: {},
      size: 0,
      vectors: {},
      isEmpty: function () {return true;},
    };


    // VirES data request class wrapping the API specific details of the
    // asynchronous data request.

    function ViresDataRequest(options) {
      var dummyFcn = function () {};
      options = options || {};
      this.xhr = null;
      this.url = get(options, 'url', null);
      this.context = get(options, 'context', null);
      this.customTemplate = get(options, 'customTemplate', null);
      this.callbacks = {
        aborted: get(options, 'aborted') || dummyFcn,
        opened: get(options, 'opened') || dummyFcn,
        completed: get(options, 'completed') || dummyFcn,
        success: get(options, 'success') || dummyFcn,
        error: get(options, 'error') || dummyFcn,
      };
    }

    ViresDataRequest.prototype = {

      abort: function () {
        if (this.xhr !== null) {
          // A request has been sent that is not yet been returned so we need to cancel it
          this.callbacks.aborted.call(this.context);
          this.xhr.abort();
          this.xhr = null;
        }
      },

      fetch: function (options) {
        options = _.clone(options || {});
        options.mimeType = 'application/msgpack';
        var template = this.customTemplate !== null ? this.customTemplate : wps_fetchDataTmpl;
        this.abort();
        this.xhr = httpRequest.asyncHttpRequest({
          context: this,
          type: 'POST',
          url: this.url,
          data: template(options),
          responseType: 'arraybuffer',
          parse: function (data, xhr) {
            var timer = new Timer();
            var decodedObj = msgpack.decode(new Uint8Array(data));
            var viresData = new ViresData(decodedObj);
            preprocessViresData(viresData);
            timer.logEllapsedTime("data parsing and pre-processing:");
            return viresData;
          },
          opened: function () {
            this.callbacks.opened.call(this.context);
          },
          completed: function () {
            this.xhr = null;
            this.callbacks.completed.call(this.context);
          },
          success: function (data) {
            this.callbacks.success.call(this.context, data);
          },
          error: function (xhr) {
            this.callbacks.error.call(this.context, xhr, parseOwsException(xhr));
          },
        });
      },
    };

    function parseOwsException(xhr) {
      var errorText = xhr.responseText.match("<ows:ExceptionText>(.*)</ows:ExceptionText>");
      if (errorText && errorText.length > 1) {
        errorText = errorText[1];
      }
      return errorText;
    }

    function preprocessViresData(data) {

      var parseTimestamps = function (variable) {
        var arr = data.data[variable];
        for (var i = 0, size = data.size; i < size; i++) {
          arr[i] = new Date(arr[i] * 1000);
        }
      };

      var convertSpacecraftToId = function (idVariable, spacecraftVariable) {
        var src = get(data.data, spacecraftVariable);
        if (!src) {return;}
        var dst = data._getNewVariable(idVariable);
        for (var i = 0, size = data.size; i < size; i++) {
          dst[i] = SPACECRAFT_TO_ID[src[i]];
        }
      };

      var calculatePeriodicLatitudes = function (dstLatitude, srcLatitude, srcOrbitDirection) {
        var odirs = get(data.data, srcOrbitDirection);
        var src = get(data.data, srcLatitude);
        if (!src || !odirs) {return;}
        var dst = data._getNewVariable(dstLatitude);
        for (var i = 0, size = data.size; i < size; i++) {
          dst[i] = latitudeToPeriodicLatitude(src[i], odirs[i]);
        }
        data.registerNewVariable(dstLatitude, [srcOrbitDirection, srcLatitude]);
      };

      var decomposeVector = function (vector, components) {
        var src = pop(data.data, vector);
        if (!src) {return;}
        var ndim = components.length;
        var dst = [];
        for (var j = 0; j < ndim; j++) {
          dst[j] = data._getNewVariable(components[j]);
        }
        for (var i = 0, size = data.size; i < size; i++) {
          for (var j = 0; j < ndim; j++) {
            dst[j][i] = src[i][j];
          }
        }
        data.registerNewVector(vector, components);
      };

      var composeVector = function (vector, components) {
        if (has(data.vectors, vector)) {
          return; // already registered
        }
        for (var i = 0, ndim = components.length; i < ndim; ++i) {
          if (!has(data.data, components[i])) {
            return; // there is a missing vector component
          }
        }
        data.registerNewVector(vector, components);
      };

      var createDerivedParameter = function (name, sources) {
        if (has(data.data, name)) {
          return; // already created
        }
        var sourceNames = _.keys(sources);
        for (var i = 0, size = sourceNames.length; i < size; ++i) {
          if (!has(data.data, sourceNames[i])) {
            return; // there is a missing source parameter
          }
        }
        var dst = null;
        _.each(sources, function (filter, sourceName) {
          var filterFunction = viresFilters.getFilterFunction(filter);
          var src = data.data[sourceName];
          if (dst == null) {
            dst = new Array(data.size);
            for (var i = 0, size = data.size; i < size; i++) {
              dst[i] = filterFunction(src[i]);
            }
          } else {
            for (var i = 0, size = data.size; i < size; i++) {
              dst[i] = dst[i] && filterFunction(src[i]);
            }
          }
        });
        data.data[name] = dst;
      };

      //var composeVector = function (
      var addTwoVectors2 = function (dstVariable, srcVariable1, srcVariable2) {
        var src1 = get(data.data, srcVariable1);
        var src2 = get(data.data, srcVariable2);
        if (!src1 || !src2 || has(data.data, dstVariable)) {return;}
        var dst = data._getNewVariable(dstVariable);
        for (var i = 0, size = data.size; i < size; i++) {
          dst[i] = [src1[i][0] + src2[i][0], src1[i][1] + src2[i][1]];
        }
        data.registerNewVariable(dstVariable, [srcVariable1, srcVariable2]);
      };

      // -----------------------------------------------------------------------

      parseTimestamps(data.TIMESTAMP);
      convertSpacecraftToId('id', 'Spacecraft');

      // Calculate new J value for AEJ LPS data.
      addTwoVectors2('J_T_NE', 'J_CF_NE', 'J_DF_NE');

      // Calculate geo and QD periodic latitudes.
      calculatePeriodicLatitudes('Latitude_periodic', 'Latitude', 'OrbitDirection');
      calculatePeriodicLatitudes('QDLatitude_periodic', 'QDLat', 'QDOrbitDirection');

      // Break down vector variables
      var vector_breakdown = _.extend(
        {}, VECTOR_BREAKDOWN, globals.userData.getVectorBreakdown()
      );

      _.each(_.keys(data.data), function (variable) {
        if (has(vector_breakdown, variable)) {
          decomposeVector(variable, vector_breakdown[variable]);
        } else if (has(REVERSE_VECTOR_COMPOSITION, variable)) {
          _.each(REVERSE_VECTOR_COMPOSITION[variable], function (item) {
            composeVector(item.source, VECTOR_COMPOSITION[item.source]);
          });
        } else if (has(REVERSE_DERIVED_PARAMETERS, variable)) {
          _.each(REVERSE_DERIVED_PARAMETERS[variable], function (item) {
            createDerivedParameter(item, DERIVED_PARAMETERS[item]);
          });
        }
      });

    }


    // VirES field-line request class wrapping the API specific details of the
    // asynchronous field-line request.

    function ViresFieldlinesRequest(options) {
      var dummyFcn = function () {};
      options = options || {};
      this.xhr = null;
      this.url = get(options, 'url', null);
      this.context = get(options, 'context', null);
      this.callbacks = {
        aborted: get(options, 'aborted') || dummyFcn,
        opened: get(options, 'opened') || dummyFcn,
        completed: get(options, 'completed') || dummyFcn,
        success: get(options, 'success') || dummyFcn,
        error: get(options, 'error') || dummyFcn,
      };
    }

    ViresFieldlinesRequest.prototype = {

      abort: function () {
        if (this.xhr !== null) {
          // A request has been sent and the response not yet been received
          // and we need to cancel it
          this.callbacks.aborted.call(this.context);
          this.xhr.abort();
          this.xhr = null;
        }
      },

      fetch: function (options) {
        options = _.clone(options || {});
        options.mimeType = 'application/msgpack';
        this.abort();
        this.xhr = httpRequest.asyncHttpRequest({
          context: this,
          type: 'POST',
          url: this.url,
          data: wps_fetchFieldlinesTmpl(options),
          responseType: 'arraybuffer',
          parse: function (data, xhr) {
            var timer = new Timer();
            var decodedObj = msgpack.decode(new Uint8Array(data));
            timer.logEllapsedTime("fieldline parsing:");
            return decodedObj;
          },
          opened: function () {
            this.callbacks.opened.call(this.context);
          },
          completed: function () {
            this.xhr = null;
            this.callbacks.completed.call(this.context);
          },
          success: function (data) {
            this.callbacks.success.call(this.context, data);
          },
          error: function (xhr) {
            this.callbacks.error.call(this.context, xhr, parseOwsException(xhr));
          },
        });
      },
    };

    var toCsv = function (header, records, delimiter) {
      return ([header.join(delimiter)].concat(_.map(records, function (record) {
        return record.join(delimiter);
      }))).join('\n');
    };

    var locationToCsv = function (points) {
      return toCsv(['Latitude', 'Longitude', 'Radius'], points, ',');
    };

    return {
      EMPTY_DATA: emptyViresData,
      ViresDataRequest: ViresDataRequest,
      ViresFieldlinesRequest: ViresFieldlinesRequest,
      locationToCsv: locationToCsv,
    };

  }

  root.define(dependencies, init);

}).call(this);
