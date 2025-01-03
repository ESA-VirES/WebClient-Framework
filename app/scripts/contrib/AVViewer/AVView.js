/* global $ _ define w2popup w2utils showMessage */
/* global graphly FilterManager BitwiseInt */
/* global savePrameterStatus VECTOR_BREAKDOWN */
/* global get has setDefault */

define(['backbone.marionette',
  'communicator',
  'app',
  'models/AVModel',
  'globals',
  'viresFilters',
  'colormap',
  'd3',
  'graphly',
  'analytics'
], function (Marionette, Communicator, App, AVModel, globals, viresFilters, colormap) {
  'use strict';

  // variables not not offered as filters
  var EXCLUDED_FILTERS = ['QDLatitude_periodic', 'Latitude_periodic'];

  // parameters not visible in the AV panel
  var EXCLUDED_PARAMETERS = [
    'J_N', 'J_E', 'J_T_N', 'J_T_E', 'J_DF_E', 'J_DF_N', 'J_CF_E', 'J_CF_N'
  ];

  // TODO: find a better place to put the extra parameters' configuration
  var EXTRA_PARAMETERS = {
    "MLT": {
      "uom": "hr",
      "name": "Magnetic Local Time",
      "periodic": {"period": 24, "offset": 0}
    },
    "QDLat": {
      "uom": "deg",
      "name": "Quasi-Dipole Latitude"
    },
    "QDLon": {
      "uom": "deg",
      "name": "Quasi-Dipole Longitude",
      "periodic": {"period": 360, "offset": -180}
    },
    "Dst": {
      "uom": "nT",
      "name": "Disturbance storm time index"
    },
    "dDst": {
      "uom": "nT/h",
      "name": "Absolute value of the temporal change rate of the Dst index"
    },
    "Kp": {
      "uom": null,
      "name": "Global geomagnetic storm index"
    },
    "F107": {
      "uom": "1e-22 J/s/m^2/Hz",
      "name": "Observed 10.7cm solar radio flux"
    },
    "OrbitNumber": {
      "uom": null,
      "name": "Orbit number"
    },
    "Latitude_periodic": {
      "uom": "deg",
      "periodic": {"period": 360, "offset": 0, "specialTicks": true}
    },
    "QDLatitude_periodic": {
      "uom": "deg",
      "periodic": {"period": 360, "offset": 0, "specialTicks": true}
    },
    "SunAzimuthAngle": {
      "uom": "deg",
      "name": "Local Sun azimuth angle"
    },
    "SunZenithAngle": {
      "uom": "deg",
      "name": "Local Sun zenith angle"
    },
    "SunHourAngle": {
      "uom": "deg",
      "name": "Local Sun hour angle"
    },
    "SunDeclination": {
      "uom": "deg",
      "name": "Sun declination"
    },
    "SunRightAscension": {
      "uom": "deg",
      "name": "Sun right ascension"
    },
    "OrbitDirection": {
      "uom": null,
      "name": "Orbit direction in geographic coordinates."
    },
    "QDOrbitDirection": {
      "uom": null,
      "name": "Orbit direction in Quasi-dipole coordinates."
    }
  };

  var UPDATED_PARAMETERS = {
    "Timestamp": {
      "uom": null,
      "scaleFormat": "time"
    },
    "timestamp": {
      "uom": null,
      "scaleFormat": "time"
    },
    "Longitude": {
      "uom": "deg",
      "periodic": {"period": 360, "offset": -180}
    }
  };


  var AVView = Marionette.View.extend({
    model: new AVModel.AVModel(),
    className: 'analytics',
    initialize: function () {
      this.isClosed = true;
      this.requestUrl = '';
      this.plotType = 'scatter';
      this.sp = undefined;

      $(window).resize(function () {
        if (this.graph && $('.d3canvas').is(':visible')) {
          this.graph.resize(true);
        }
      }.bind(this));

      this.connectDataEvents();
    },

    onShow: function () {
      var that = this;
      this.stopListening(Communicator.mediator, 'change:axis:parameters', this.onChangeAxisParameters);
      this.listenTo(Communicator.mediator, 'change:axis:parameters', this.onChangeAxisParameters);

      this.selectionList = [];
      this.plotdata = [];
      this.requestUrl = '';
      this.img = null;
      this.overlay = null;
      this.activeWPSproducts = [];
      this.plotType = 'scatter';
      this.prevParams = null;
      this.fieldsforfiltering = [];


      $('#saveRendering').off();
      $('#saveRendering').remove();
      this.$el.append('<div type="button" class="btn btn-success darkbutton" id="saveRendering" title="Save as image"><i class="fa fa-floppy-o" aria-hidden="true"></i></div>');

      $('#saveRendering').click(function () {
        var bodyContainer = $('<div/>');

        var typeContainer = $('<div id="typeSelectionContainer"></div>');
        var filetypeSelection = $('<select id="filetypeSelection"></select>');
        filetypeSelection.append($('<option/>').html('png'));
        filetypeSelection.append($('<option/>').html('jpeg'));
        filetypeSelection.append($('<option/>').html('svg'));
        typeContainer.append(
          $('<label for="filetypeSelection" style="margin-right:10px;">Output type</label>')
        );
        typeContainer.append(filetypeSelection);
        var w = $('#graph').width();
        var h = $('#graph').height();

        var resolutionContainer = $('<div id="resolutionSelectionContainer"></div>');
        var resolutionSelection = $('<select id="resolutionSelection"></select>');
        resolutionSelection.append($('<option/>').html('normal (' + w + 'x' + h + ')').val(1));
        resolutionSelection.append($('<option/>').html('large (' + w * 2 + 'x' + h * 2 + ')').val(2));
        resolutionSelection.append($('<option/>').html('very large (' + w * 3 + 'x' + h * 3 + ')').val(3));
        resolutionContainer.append(
          $('<label for="resolutionSelection" style="margin-right:10px;">Resolution</label>')
        );
        resolutionContainer.append(resolutionSelection);

        bodyContainer.append(typeContainer);
        bodyContainer.append(resolutionContainer);

        var okbutton = $('<button style="margin-right:5px;">Ok</button>');
        var cancelbutton = $('<button style="margin-left:5px;">Cancel</button>');
        var buttons = $('<div/>');
        buttons.append(okbutton);
        buttons.append(cancelbutton);

        if (that.graph) {
          var saveimagedialog = w2popup.open({
            body: bodyContainer,
            buttons: buttons,
            title: w2utils.lang('Image configuration'),
            width: 400,
            height: 200
          });

          okbutton.click(function () {
            var selectedType = $('#filetypeSelection')
              .find(":selected").text();
            var selectedRes = $('#resolutionSelection')
              .find(":selected").val();

            var rightNow = new Date();
            var res = rightNow.toISOString().slice(0, 10).replace(/-/g, '');
            that.graph.fileSaveString = 'VirES_for_Swarm_' + res + '.' + selectedType;
            that.graph.saveImage(selectedType, selectedRes);
            bodyContainer.remove();
            saveimagedialog.close();
          });
          cancelbutton.click(function () {
            bodyContainer.remove();
            saveimagedialog.close();
          });
        }
      });


      $('#resetZoom').off();
      $('#resetZoom').remove();

      this.$el.append('<div type="button" class="btn btn-success darkbutton" id="resetZoom" title="Reset graph zoom"><i class="fa fa-refresh" aria-hidden="true"></i></div>');

      this.$el.append('<div type="button" class="btn btn-success darkbutton" id="productInfo" title="Show product information"><i class="fa fa-info" aria-hidden="true"></i></div>');

      $('#productInfo').click(function () {
        if (this.productSourcesContainerExists()) {
          this.removeProductSourcesContainer();
        } else {
          this.createProductSourcesContainer(
            globals.swarm.get('data')
          );
        }
      }.bind(this));

      if (typeof this.graph === 'undefined') {
        this.$el.append('<div class="d3canvas"></div>');
        this.$('.d3canvas').append('<div id="graph"></div>');
        this.$('.d3canvas').append('<div id="filterDivContainer"></div>');
        this.$('#filterDivContainer').append('<div id="analyticsFilters"></div>');
        this.$el.append('<div id="nodataavailable"></div>');
        $('#nodataavailable').html('<span>Loading data</span> <i class="fa fa-spinner fa-spin"></i>');

      } else if (this.graph) {
        this.graph.resize();
      }

      $('#resetZoom').click(function () {
        that.graph.initAxis();
        that.graph.renderData();
      });


      // Set height of graph depending on
      var filtersMinimized = localStorage.getItem('filtersMinimized');
      if (filtersMinimized === null) {
        filtersMinimized = false;
      } else {
        filtersMinimized = JSON.parse(filtersMinimized);
      }

      if (filtersMinimized) {
        $('#filterSelectDrop').css('opacity', 0);
        $('#analyticsFilters').css('opacity', 0);
        $('#graph').css('height', '99%');
      }

      this.$('#filterDivContainer').append('<div id="filterSelectDrop"></div>');

      this.reloadUOM();

      var filterList = localStorage.getItem('selectedFilterList');
      if (filterList !== null) {
        filterList = JSON.parse(filterList);
        this.selectedFilterList = filterList;
      } else {
        this.selectedFilterList = ['F', 'B_N', 'B_E', 'B_C', 'Dst', 'QDLat', 'MLT'];
      }


      // Initialize graphly filter manager
      this.filterManager = (function (selectedFilterList) {

        var filtersGlobal = _.omit(globals.swarm.get('uom_set'), EXCLUDED_FILTERS);

        var maskParameters = {};
        _.each(filtersGlobal, function (item, name) {
          if (has(item, "bitmask")) {
            maskParameters[name] = {values: item.bitmask.flags};
          }
        });

        var manager = new FilterManager({
          el: '#analyticsFilters',
          filterSettings: {
            visibleFilters: selectedFilterList,
            dataSettings: filtersGlobal,
            parameterMatrix: {},
            maskParameter: maskParameters,
          },
          showCloseButtons: true,
          ignoreParameters: EXCLUDED_PARAMETERS,
        });


        _.each(
          globals.swarm.get('filters') || {},
          function (filter, name) {
            switch (filter.type) {
              case "RangeFilter":
                manager._setFilter(name, filter.lowerBound, filter.upperBound);
                break;
              case "BitmaskFilter":
                manager._setMaskFilter(name, filter.mask, filter.selection);
                break;
            }
          }
        );

        return manager;

      })(this.selectedFilterList);

      this.filterManager.on('filterChange', function (filters) {
        var names = _.intersection(this.visibleFilters, _.keys(filters));
        var appliedFilters = {};

        _.each(_.pick(this.brushes, names), function (range, name) {
          appliedFilters[name] = viresFilters.createRangeFilter(range[0], range[1]);
        });

        _.each(_.pick(this.maskParameter, names), function (data, name) {
          appliedFilters[name] = viresFilters.createBitmaskFilter(
            data.enabled.length,
            BitwiseInt.fromBoolArray(data.enabled).toNumber(),
            BitwiseInt.fromBoolArray(data.selection).toNumber()
          );
        });

        localStorage.setItem('filterSelection', JSON.stringify(appliedFilters));
        globals.swarm.set({filters: appliedFilters});
        Communicator.mediator.trigger('analytics:set:filter', appliedFilters);

        // Make sure any open tooltips are cleared
        $('.ui-tooltip').remove();
      });

      this.filterManager.on('removeFilter', _.bind(function (filterName) {
        var manager = this.graph.filterManager;

        manager.visibleFilters = _.without(manager.visibleFilters, filterName);
        manager._removeFilter(filterName);
        manager._filtersChanged();

        this.selectedFilterList = manager.visibleFilters;
        localStorage.setItem('selectedFilterList', JSON.stringify(this.selectedFilterList));

        // I can modify options of w2field, but not aUOM, thus rerendering everything in list
        that.renderFilterList();
      }, this));


      var identifiers = [];
      for (var key in globals.swarm.satellites) {
        if (globals.swarm.satellites[key]) {
          identifiers.push(key);
        }
      }

      var xax = 'Latitude';
      var xlabel = null;
      var additionalXTicks = null;
      var yax = ['F'];
      var yAxisLabel = [];
      var y2ax = [];
      var y2AxisLabel = [];
      var colax = [];
      var colax2 = [];
      var yAxisLocked = null;
      var y2AxisLocked = null;
      var yAxisExtent = null;
      var y2AxisExtent = null;

      if (localStorage.getItem('plotConfiguration') !== null) {

        var plotConfiguration = JSON.parse(localStorage.getItem('plotConfiguration'));
        yax = [];
        for (var i = 0; i < plotConfiguration.length; i++) {
          yax.push(plotConfiguration[i].yAxis);
          y2ax.push(plotConfiguration[i].y2Axis);
          colax.push(plotConfiguration[i].colorAxis);
          colax2.push(plotConfiguration[i].colorAxis2);

          if (plotConfiguration[i].hasOwnProperty('yAxisLabel')) {
            yAxisLabel.push(plotConfiguration[i].yAxisLabel);
          }
          if (plotConfiguration[i].hasOwnProperty('y2AxisLabel')) {
            y2AxisLabel.push(plotConfiguration[i].y2AxisLabel);
          }
        }
      }

      if (localStorage.getItem('xAxisSelection') !== null) {
        xax = JSON.parse(localStorage.getItem('xAxisSelection'));
      }

      if (localStorage.getItem('xAxisLabel') !== null) {
        xlabel = JSON.parse(localStorage.getItem('xAxisLabel'));
      }

      if (localStorage.getItem('additionalXTicks') !== null) {
        additionalXTicks = JSON.parse(
          localStorage.getItem('additionalXTicks')
        );
      }

      if (localStorage.getItem('yAxisLocked') !== null) {
        yAxisLocked = JSON.parse(
          localStorage.getItem('yAxisLocked')
        );
      }
      if (localStorage.getItem('y2AxisLocked') !== null) {
        y2AxisLocked = JSON.parse(
          localStorage.getItem('y2AxisLocked')
        );
      }
      if (localStorage.getItem('yAxisExtent') !== null) {
        yAxisExtent = JSON.parse(
          localStorage.getItem('yAxisExtent')
        );
      }
      if (localStorage.getItem('y2AxisExtent') !== null) {
        y2AxisExtent = JSON.parse(
          localStorage.getItem('y2AxisExtent')
        );
      }

      // Check if previous config used multiaxis

      var multipleAxis = false;
      if (Array.isArray(yax) && yax.length > 0) {
        for (var i = 0; i < yax.length; i++) {
          if (Array.isArray(yax[i])) {
            multipleAxis = true;
          }
        }
      } else {
        // TODO what if nothing is defined for yaxis
      }

      var multipleAxis2 = false;
      if (Array.isArray(y2ax) && y2ax.length > 0) {
        for (var i = 0; i < y2ax.length; i++) {
          if (Array.isArray(y2ax[i])) {
            multipleAxis2 = true;
          }
        }
      } else {
        // TODO what if nothing is defined for yaxis
      }

      if (!multipleAxis) {
        yax = [yax];
        for (var i = 0; i < yax.length; i++) {
          var currCols = [];
          for (var j = 0; j < yax[i].length; j++) {
            currCols.push(null);
          }
          colax.push(currCols);
        }
      }

      if (!multipleAxis2) {
        y2ax = [y2ax];
        for (var i = 0; i < y2ax.length; i++) {
          var currCols = [];
          for (var j = 0; j < y2ax[i].length; j++) {
            currCols.push(null);
          }
          colax2.push(currCols);
        }
      }

      // Do a sanity check for colorscale as we were saving
      // them incorrectly
      if (yax.length < colax.length || yax.length > colax.length) {
        //Overwrite with default values
        colax = [];
        for (var i = 0; i < yax.length; i++) {
          var currCols = [];
          for (var j = 0; j < yax[i].length; j++) {
            currCols.push(null);
          }
          colax.push(currCols);
        }

      }

      if (y2ax.length < colax2.length || y2ax.length > colax2.length) {
        //Overwrite with default values
        colax2 = [];
        for (var i = 0; i < y2ax.length; i++) {
          var currCols = [];
          for (var j = 0; j < y2ax[i].length; j++) {
            currCols.push(null);
          }
          colax2.push(currCols);
        }
      }


      this.renderSettings = {
        xAxis: xax,
        yAxis: yax,
        colorAxis: colax,
        y2Axis: y2ax,
        colorAxis2: colax2,
        dataIdentifier: {
          parameter: 'id',
          identifiers: identifiers
        }
      };

      if (yAxisLabel.length > 0) {
        this.renderSettings.yAxisLabel = yAxisLabel;
      }
      if (y2AxisLabel.length > 0) {
        this.renderSettings.y2AxisLabel = y2AxisLabel;
      }
      if (xlabel) {
        this.renderSettings.xAxisLabel = xlabel;
      }
      if (additionalXTicks) {
        this.renderSettings.additionalXTicks = additionalXTicks;
      }
      if (yAxisLocked) {
        this.renderSettings.yAxisLocked = yAxisLocked;
      }
      if (y2AxisLocked) {
        this.renderSettings.y2AxisLocked = y2AxisLocked;
      }
      if (yAxisExtent) {
        this.renderSettings.yAxisExtent = yAxisExtent;
      }
      if (y2AxisExtent) {
        this.renderSettings.y2AxisExtent = y2AxisExtent;
      }


      this.graph = new graphly.graphly({
        el: '#graph',
        dataSettings: globals.swarm.get('uom_set'),
        renderSettings: this.renderSettings,
        filterManager: this.filterManager,
        enableFit: false,
        multiYAxis: true,
        margin: {top: 40, left: 90, bottom: 50, right: 45},
        enableSubXAxis: 'Timestamp',
        enableSubYAxis: false,
        colorscaleOptionLabel: 'Add third variable',
        ignoreParameters: EXCLUDED_PARAMETERS,
        colorscaleDefinitions: colormap.colorscaleDefinitions,
        colorscale: _.sortBy(_.keys(colormap.colorscaleDefinitions)),
        allowLockingAxisScale: true,
      });

      this.graph.on('colorScaleChange', function (parameter) {
        globals.swarm.set('uom_set', this.dataSettings);
      });

      this.graph.on('axisChange', function () {

        localStorage.setItem(
          'xAxisSelection',
          JSON.stringify(this.renderSettings.xAxis)
        );
        localStorage.setItem(
          'xAxisLabel',
          JSON.stringify(this.xAxisLabel)
        );

        if (this.renderSettings.hasOwnProperty('additionalXTicks')) {
          // Save additional x ticks to localstorage
          localStorage.setItem(
            'additionalXTicks',
            JSON.stringify(this.renderSettings.additionalXTicks)
          );
        }

        var currL = this.renderSettings.yAxis.length;
        var confArr = [];
        for (var i = 0; i < currL; i++) {
          confArr.push({
            yAxis: this.renderSettings.yAxis[i],
            yAxisLabel: this.yAxisLabel[i],
            y2Axis: this.renderSettings.y2Axis[i],
            y2AxisLabel: this.y2AxisLabel[i],
            colorAxis: this.renderSettings.colorAxis[i],
            colorAxis2: this.renderSettings.colorAxis2[i]
          });
        }

        localStorage.setItem(
          'plotConfiguration', JSON.stringify(confArr)
        );

        // Save disabled overlays.
        var disabledOverlays = {};
        _.each(this.overlaySettings, function (data, productType) {
          _.each(data.typeDefinition, function (typeDefinition) {
            if (!get(typeDefinition, 'active', true)) {
              setDefault(disabledOverlays, productType, []);
              disabledOverlays[productType].push(typeDefinition.name);
            }
          });
        });
        localStorage.setItem(
          'disabledOverlays', JSON.stringify(disabledOverlays)
        );

        savePrameterStatus(globals);
      });

      this.graph.on('axisExtentChanged', function () {
        localStorage.setItem(
          'yAxisExtent', JSON.stringify(this.renderSettings.yAxisExtent)
        );
        localStorage.setItem(
          'y2AxisExtent', JSON.stringify(this.renderSettings.y2AxisExtent)
        );
        localStorage.setItem(
          'yAxisLocked', JSON.stringify(this.renderSettings.yAxisLocked)
        );
        localStorage.setItem(
          'y2AxisLocked', JSON.stringify(this.renderSettings.y2AxisLocked)
        );
        // Save also possible set color ranges
        savePrameterStatus(globals);
      });

      this.graph.on('pointSelect', function (values) {
        if (values !== null) {
          Communicator.mediator.trigger(
            'cesium:highlight:point',
            [values.Latitude, values.Longitude, values.Radius]
          );
        } else {
          Communicator.mediator.trigger('cesium:highlight:removeAll');
        }
      });

      var data = globals.swarm.get('data');
      if (!data.isEmpty()) {
        this.graph.loadData(data.data);
        this.filterManager.loadData(data.data);
        $('#nodataavailable').hide();
        $('.d3canvas').show();
        this.renderFilterList();
      }

      var relatedData = globals.swarm.get('relatedData').attributes;
      if (!$.isEmptyObject(relatedData)) {
        this.loadRelatedData();
      }

      this.isClosed = false;

      return this;
    }, //onShow end

    connectDataEvents: function () {

      globals.swarm.on('change:data', _.bind(this.reloadData, this));
      globals.swarm.on('change:sources', _.bind(this.updateProductSourcesContainer, this));
      globals.swarm.get('relatedData').on('change', _.bind(this.loadRelatedData, this));
    },

    loadRelatedData: function (model) {

      var getNanIndices = function (values) {
        var indices = [];
        for (var idx = 0, size = values.length; idx < size; ++idx) {
          if (Number.isNaN(values[idx])) {
            indices.push(idx);
          }
        }
        return indices;
      };

      var setValues = function (target, value, indices) {
        if (indices) {
          for (var i = 0, size = indices.length; i < size; ++i) {
            target[indices[i]] = value;
          }
        } else {
          for (var i = 0, size = target.length; i < size; ++i) {
            target[i] = value;
          }
        }
      };

      var dataCorrections = {
        "AEJ_PBS": function (data) {
          var indices = getNanIndices(data.J_DF_SemiQD);
          setValues(data.J_DF_SemiQD, 0, indices);
          //setValues(data.J_CF_SemiQD, 0, indices);
          //setValues(data.J_R, 0, indices);
        },
        "AEJ_PBL": function (data) {
          var indices = getNanIndices(data.J_QD);
          setValues(data.J_QD, 0, indices);
        },
        "AOB_FAC": function (data) {
          setValues(data.FAC, 0);
        },
      };

      var PT_AEJ_POINT_TYPE_MASK = 0x2;
      var PT_AEJ_BOUNDARY = 0x2;
      var PT_AEJ_PEAK = 0x0;
      var BF_AOB_POINT_TYPE_MASK = 0x3;
      var BF_AOB_EW_BOUNDARY = 0x1;
      var BF_AOB_PW_BOUNDARY = 0x2;

      // We create combined settings and dataset for related data
      var overlaySettings = {};
      var overlayData = {};
      var relatedData = globals.swarm.get('relatedData').attributes;

      _.each(relatedData, function (data, key) {
        switch (key) {
          case 'AEJ_PBL':
          case 'AEJ_PBS':
            overlaySettings[key] = {
              keyParameter: 'PointType',
              displayParameters: ['J_QD', 'J_DF_SemiQD'],
              typeDefinition: [
                {
                  match: function (value) {
                    return (value & PT_AEJ_POINT_TYPE_MASK) === PT_AEJ_PEAK;
                  },
                  name: 'Peak electrojet current',
                  style: {
                    symbol: 'triangle_empty',
                    size: 15,
                    color: [0.0, 0, 0.0, 0.8],
                  }
                },
                {
                  match: function (value) {
                    return (value & PT_AEJ_POINT_TYPE_MASK) === PT_AEJ_BOUNDARY;
                  },
                  name: 'Electrojet Boundary',
                  style: {
                    symbol: 'rectangle_empty',
                    size: 13,
                    color: [0, 0, 0.0, 0.8],
                  }
                },
              ]
            };
            overlayData[key] = data.data;
            break;
          case 'AOB_FAC':
            overlaySettings[key] = {
              keyParameter: 'Boundary_Flag',
              displayParameters: ['FAC'],
              typeDefinition: [
                {
                  match: function (value) {
                    return (value & BF_AOB_POINT_TYPE_MASK) === BF_AOB_EW_BOUNDARY;
                  },
                  name: 'Aurora oval equatorward boundary',
                  style: {
                    symbol: 'diamond_empty',
                    size: 13 * Math.sqrt(2),
                    color: [0.0, 0.25, 0.0, 0.8],
                  }
                },
                {
                  match: function (value) {
                    return (value & BF_AOB_POINT_TYPE_MASK) === BF_AOB_PW_BOUNDARY;
                  },
                  name: 'Aurora oval poleward boundary',
                  style: {
                    symbol: 'diamond_empty',
                    size: 13 * Math.sqrt(2),
                    color: [0.25, 0.0, 0.0, 0.8],
                  }
                },
              ]
            };
            overlayData[key] = data.data;
            break;
                    /*
                    case 'AEJ_PBS:GroundMagneticDisturbance':
                        overlaySettings[key] = {
                            keyParameter: 'Timestamp',
                            typeDefinition: [
                                {
                                    match: function () {return true;},
                                    name: 'Peak Magnetic disturbance',
                                    style: {
                                        symbol: 'circle_empty',
                                        size: 15,
                                        color: [0.0, 0, 0.0, 0.8],
                                    }
                                },
                            ]
                        };
                        overlayData[key] = data.data;
                        break;
                    */
        }
      });

      // Load and set disabled overlays.
      var disabledOverlays = JSON.parse(localStorage.getItem('disabledOverlays')) || {};
      if (Array.isArray(disabledOverlays)) {
        // ignore arrays stored by the earlier version
        disabledOverlays = {};
      }
      _.each(overlaySettings, function (item, key) {
        _.each(item.typeDefinition, function (typeDefinition) {
          typeDefinition.active = !(
            get(disabledOverlays, key, []).includes(typeDefinition.name)
          );
        });
      });

      // Apply data corrections.
      _.each(overlayData, function (data, productType) {
        var correctData = get(dataCorrections, productType);
        if (correctData) {
          correctData(data);
        }
      });

      this.graph.overlaySettings = overlaySettings;
      this.graph.loadOverlayData(overlayData);
    },

    updateProductSourcesContainer: function () {
      if (this.productSourcesContainerExists()) {
        this.removeProductSourcesContainer();
        this.createProductSourcesContainer();
      }
    },

    createProductSourcesContainer: function () {
      var sources = globals.swarm.get('sources');
      this.$el.append('<div id="productSourcesInfoContainer" class="sourcesInfoContainer"></div>');
      $('#productSourcesInfoContainer').append('<button type="button" class="close" title="Close panel" data-dismiss="alert" aria-hidden="true">&times;</button>');
      $('#productSourcesInfoContainer').append('<h4>Data sources:</h4>');
      $('#productSourcesInfoContainer').append('<ul id="productInfoList"></ul>');
      for (var i = 0; i < sources.length; i++) {
        $('#productInfoList').append(
          '<li>' + sources[i] + '</li>'
        );
      }
    },

    removeProductSourcesContainer: function () {
      $('#productSourcesInfoContainer').remove();
    },

    productSourcesContainerExists: function () {
      return $('#productSourcesInfoContainer').length > 0;
    },

    createSubscript: function createSubscript(string) {
      // Adding subscript elements to string which contain underscores
      var newkey = "";
      var parts = string.split("_");
      if (parts.length > 1) {
        newkey = parts[0];
        for (var i = 1; i < parts.length; i++) {
          newkey += (" " + parts[i]).sub();
        }
      } else {
        newkey = string;
      }
      return newkey;
    },

    reloadUOM: function () {
      var availableParameters = {};
      var activeParameters = {};

      // extract parameters from the product configuration
      globals.products.each(function (product) {
        var isVisible = product.get('visible');

        // extract all available parameters
        _.each(product.get('download_parameters') || {}, function (item, name) {
          if (get(item, "ignore")) return;
          var item_copy = _.clone(item);
          availableParameters[name] = item_copy;
          if (isVisible) {
            activeParameters[name] = item_copy;
          }
        });

        // extract addition options from the client parameters
        _.each(product.get('parameters') || {}, function (item, name) {
          _.extend(availableParameters[name], _.pick(item, [
            "bitmask", "errorParameter", "errorDisplayed",
          ]));
        });
      });

      // update parameters
      _.each(UPDATED_PARAMETERS, function (values, name) {
        if (has(availableParameters, name)) {
          _.extend(availableParameters[name], values);
        }
      });

      // add extra parameters
      _.each(EXTRA_PARAMETERS, function (values, name) {
        availableParameters[name] = _.clone(values);
      });

      // split vectors into their components
      var _splitVector = function (object, vector, components, remove) {
        if (!has(object, vector)) {return;}
        _.each(components, function (component) {
          object[component] = _.clone(object[vector]);
          object[component].name = 'Component of ' + object[vector].name;
        });
        if (remove) {delete object[vector];}
      };

      _.each(VECTOR_BREAKDOWN, function (components, vector) {
        _splitVector(availableParameters, vector, components, false);
        _splitVector(activeParameters, vector, components, true);
      });

      // load saved settings
      var parameterSettings = JSON.parse(localStorage.getItem('parameterConfiguration'));
      if (parameterSettings !== null) {
        _.each(parameterSettings, function (values, name) {
          if (has(availableParameters, name)) {
            _.extend(availableParameters[name], values);
          }
        });
      }

      this.sp = {uom_set: availableParameters};
      this.activeParameters = activeParameters;
      globals.swarm.set('uom_set', availableParameters);
    },

    handleItemSelected: function handleItemSelected(evt) {
      var selected = $('#inputAnalyticsAddfilter').val();
      if (selected !== '') {
        this.selectedFilterList.push(selected);
        this.graph.filterManager.visibleFilters = this.selectedFilterList;
        this.graph.filterManager._filtersChanged();
        localStorage.setItem('selectedFilterList', JSON.stringify(this.selectedFilterList));
        this.renderFilterList();
      }
    },

    changeFilterDisplayStatus: function changeFilterDisplayStatus() {
      var that = this;
      var height = '99%';
      var opacity = 0.0;
      var direction = 'up';
      if ($('#minimizeFilters').hasClass('minimized')) {
        height = ($('#graph').height() - 270) + 'px';
        opacity = 1.0;
        direction = 'down';
        $('#minimizeFilters').attr('class', 'visible');
        localStorage.setItem(
          'filtersMinimized', JSON.stringify(false)
        );
      } else {
        $('#minimizeFilters').attr('class', 'minimized');
        localStorage.setItem(
          'filtersMinimized', JSON.stringify(true)
        );
      }

      $('#filterSelectDrop').animate({opacity: opacity}, 1000);
      $('#analyticsFilters').animate({opacity: opacity}, 1000);
      $('#graph').animate({height: height}, {
        step: function (now, fx) {
          //that.graph.resize();
        },
        done: function () {
          $('#minimizeFilters i').attr('class',
            'fa fa-chevron-circle-' + direction
          );
          that.graph.resize();
        }
      }, 1000);
      //that.graph.resize();
    },

    renderFilterList: function renderFilterList() {

      var that = this;
      this.$el.find("#filterSelectDrop").empty();
      var filCon = this.$el.find("#filterSelectDrop");

      $('#resetFilters').off();
      filCon.append('<button id="resetFilters" type="button" class="btn btn-success darkbutton">Reset filters</button>');
      $('#resetFilters').click(function () {
        that.graph.filterManager.resetManager();
      });


      // Set height of graph depending on
      var filtersMinimized = localStorage.getItem('filtersMinimized');
      if (filtersMinimized === null) {
        filtersMinimized = false;
      } else {
        filtersMinimized = JSON.parse(filtersMinimized);
      }

      var direction = 'down';
      if (filtersMinimized) {
        direction = 'up';
      }

      $('#minimizeFilters').off();
      $('#minimizeFilters').remove();
      $('#filterDivContainer').append(
        '<div id="minimizeFilters" class="visible"><i class="fa fa-chevron-circle-' + direction + '" aria-hidden="true"></i></div>'
      );

      var filtersMinimized = localStorage.getItem('filtersMinimized');
      if (filtersMinimized === null) {
        filtersMinimized = false;
      } else {
        filtersMinimized = JSON.parse(filtersMinimized);
      }

      if (filtersMinimized) {
        $('#minimizeFilters').addClass('minimized');
      } else {
        $('#minimizeFilters').addClass('visible');
      }

      $('#minimizeFilters').click(this.changeFilterDisplayStatus.bind(this));

      filCon.find('.w2ui-field').remove();

      // Show only filters for currently available data, ...
      var aUOM = _.pick(globals.swarm.get('uom_set'), this.currentKeys);

      // ... do not show currently visible filters,
      // and remove other excluded parameters
      aUOM = _.omit(aUOM, _.flatten([
        this.selectedFilterList,
        EXCLUDED_FILTERS,
        EXCLUDED_PARAMETERS,
        [
          'Timestamp', 'timestamp', 'q_NEC_CRF', 'GPS_Position',
          'LEO_Position', 'Spacecraft', 'id',
        ]
      ]));

      $('#filterSelectDrop').prepend(
        '<div class="w2ui-field"> <button id="analyticsAddFilter" type="button" class="btn btn-success darkbutton dropdown-toggle">Add filter <span class="caret"></span></button> <input type="list" id="inputAnalyticsAddfilter"></div>'
      );

      $("#analyticsAddFilter").click(function () {
        $('.w2ui-field-helper input').css('text-indent', '0em');
        $("#inputAnalyticsAddfilter").focus();
      });

      var that = this;
      $('#inputAnalyticsAddfilter').off();

      $('#inputAnalyticsAddfilter').w2field('list', {
        items: _.keys(aUOM).sort(),
        renderDrop: function (item, options) {
          var html = '<b>' + that.createSubscript(item.id) + '</b>';
          if (aUOM[item.id].uom != null) {
            html += ' [' + aUOM[item.id].uom + ']';
          }
          if (aUOM[item.id].name != null) {
            html += ': ' + aUOM[item.id].name;
          }
          return html;
        },
        compare: function (item) {
          var userIn = $('.w2ui-field-helper input').val();
          //console.log(item, $('.w2ui-field-helper input').val());
          if (userIn.length === 0) {
            return true;
          } else {
            userIn = userIn.toLowerCase();
            var par = aUOM[item.id];
            var inputInId = item.id.toLowerCase().replace(/[^a-zA-Z0-9]/g, '')
              .includes(userIn.replace(/[^a-zA-Z0-9]/g, ''));
            var inputInUOM = par.hasOwnProperty('uom') &&
                        par.uom !== null &&
                        par.uom.toLowerCase().includes(userIn);
            var inputInName = par.hasOwnProperty('name') &&
                        par.name !== null &&
                        par.name.toLowerCase().includes(userIn);
            if (inputInId || inputInUOM || inputInName) {
              return true;
            } else {
              return false;
            }
          }

        }
      });

      $('.w2ui-field-helper input').attr('placeholder', 'Type to search');

      $('#inputAnalyticsAddfilter').change(this.handleItemSelected.bind(this));
    },

    reloadData: function (model, data) {

      function itemExists(itemArray, item) {
        for (var i = 0; i < itemArray.length; ++i) {
          if (itemArray[i].includes(item)) {
            return true;
          }
        }
        return false;
      }

      // stop if element already has no plot rendering
      if (!$(this.el).html()) {return;}

      if (data.isEmpty()) {
        $('#nodataavailable').text('No data available for current selection');
        $('#nodataavailable').show();
        $('.d3canvas').hide();
        return;
      }

      var idKeys = _.keys(data.data);
      this.currentKeys = idKeys;

      $('#nodataavailable').hide();
      $('.d3canvas').show();

      var identifiers = [];
      for (var key in globals.swarm.satellites) {
        if (globals.swarm.satellites[key]) {
          identifiers.push(key);
        }
      }

      this.graph.renderSettings.dataIdentifier = {
        parameter: 'id',
        identifiers: identifiers
      };

      var availableParameters = {};
      _.each(data.info.variables, function (variables, label) {
        availableParameters[label] = _.flatten(
          _.map(variables, function (variable) {
            return get(data.vectors, variable) || [variable];
          })
        );
      });
      this.renderSettings.availableParameters = availableParameters;

      // Calculate very rough estimate of rendered points
      var renderedPoints = (
        data.size * this.renderSettings.yAxis.length
      );
      if (renderedPoints < 10000) {
        this.graph.debounceActive = false;
      } else {
        this.graph.debounceActive = true;
      }

      var needsResize = false;

      if (this.prevParams === null) {
        // First time loading data we set previous to current data
        if (localStorage.getItem('plotConfiguration') !== null) {
          // this is first load and no config is available
          // so we need to load default values
          this.prevParams = idKeys;
        }
      }

      // If data parameters have changed
      // if this is first data load prev params is empty so ideally
      // config from last time should be loaded
      if (!_.isEqual(this.prevParams, idKeys)) {
        // Define which parameters should be selected defaultwise as filtering
        var requiredFilters = [
          'DataSource', 'Flags_F', 'Flags_B',
          'Ne', 'Te', 'Bubble_Probability', 'Flags_Bubble',
          'Relative_STEC_RMS', 'Relative_STEC', 'Absolute_STEC',
          'Absolute_VTEC', 'Elevation_Angle',
          'IRC', 'FAC',
          'EEF',
          'J_QD', 'J_DF_SemiQD', 'J_CF_SemiQD',
          'Ti_meas_drift', 'Tn_msis', 'Flag_ti_meas',
          'M_i_eff_Flags', 'M_i_eff', 'N_i', 'T_e',
          'Pair_Indicator', 'Boundary_Flag',
          'Viy', 'Viz', 'Vixh', 'Vixv', 'Quality_flags', 'Calibration_flags',
        ];

        var residuals = _.filter(idKeys, function (item) {
          return item.includes('_res_');
        });
        // If new datasets contains residuals add those instead of normal components
        if (residuals.length > 0) {
          requiredFilters = requiredFilters.concat(residuals);
        } else {
          requiredFilters = requiredFilters.concat(['F', 'F_error']);
        }

        // Strip non-available parameters from the required filters
        requiredFilters = _.intersection(requiredFilters, idKeys);

        // Add the required filters
        this.selectedFilterList = _.union(this.selectedFilterList, requiredFilters);
        localStorage.setItem('selectedFilterList', JSON.stringify(this.selectedFilterList));

        // Update filters
        var manager = this.graph.filterManager;
        _.each(_.difference(manager.visibleFilters, idKeys), manager._removeFilter, manager);
        manager.visibleFilters = this.selectedFilterList;

        // Check if we want to change the y-selection
        // If previous does not contain key data and new one
        // does we add key parameter to selection in plot
        var parasToCheck = [
          'Ne', 'F', 'Bubble_Probability', 'Absolute_STEC',
          'FAC', 'EEF', 'J_QD', 'J_DF_SemiQD', 'J_CF_SemiQD',
          'Pair_Indicator',
          'Ti_meas_drift', // EFIxTIE default
          'M_i_eff', 'N_i', // EFIxIDM defaults
          'Viy', 'Viz', // EFIxTCT defaults
        ];

        // Go trough all plots and see if they need to be removed
        // now that data has changed
        var renSetY = this.renderSettings.yAxis;
        var renSetY2 = this.renderSettings.y2Axis;
        var colAx = this.renderSettings.colorAxis;
        var colAx2 = this.renderSettings.colorAxis2;
        var yAxisExtent = this.renderSettings.yAxisExtent;
        var y2AxisExtent = this.renderSettings.y2AxisExtent;
        var yAxisLocked = this.renderSettings.yAxisLocked;
        var y2AxisLocked = this.renderSettings.y2AxisLocked;

        for (var pY = renSetY.length - 1; pY >= 0; pY--) {

          // Go through all elements of plot, first left y axis
          // and remove them if no longer available
          for (var yy = renSetY[pY].length - 1; yy >= 0; yy--) {
            if (idKeys.indexOf(renSetY[pY][yy]) === -1) {
              renSetY[pY].splice(yy, 1);
              // remove corresponding cs
              colAx[pY].splice(yy, 1);
              yAxisExtent.splice(yy, 1);
              yAxisLocked.splice(yy, 1);
            }
          }

          // Go through all elements of plot, now right y axis
          // and remove them if no longer available
          for (var yy2 = renSetY2[pY].length - 1; yy2 >= 0; yy2--) {
            if (idKeys.indexOf(renSetY2[pY][yy2]) === -1) {
              renSetY2[pY].splice(yy2, 1);
              // remove corresponding cs
              colAx2[pY].splice(yy2, 1);
              y2AxisExtent.splice(yy2, 1);
              y2AxisLocked.splice(yy2, 1);
            }
          }

          // Chech if both left and right are empty we remove
          // the complete plot
          if (renSetY[pY].length === 0 && renSetY2[pY].length === 0) {
            renSetY.splice(pY, 1);
            renSetY2.splice(pY, 1);
            colAx.splice(pY, 1);
            colAx2.splice(pY, 1);
            yAxisExtent.splice(pY, 1);
            yAxisLocked.splice(pY, 1);
            y2AxisExtent.splice(pY, 1);
            y2AxisLocked.splice(pY, 1);
          }
        }


        // Check if we want to add any new parameters as new
        // plot that have been added in the change
        for (var pc = 0; pc < parasToCheck.length; pc++) {
          if (idKeys.indexOf(parasToCheck[pc]) !== -1) {
            // Check if parameter is not already selected
            if (!itemExists(renSetY, parasToCheck[pc]) &&
                            !itemExists(renSetY2, parasToCheck[pc])) {

              renSetY.push([parasToCheck[pc]]);
              colAx.push([null]);
              renSetY2.push([]);
              colAx2.push([]);
              yAxisExtent.push(null);
              yAxisLocked.push(false);
              y2AxisExtent.push(null);
              y2AxisLocked.push(false);
            }
          }
        }

        // Check if residuals have been added and add them as plot
        for (var ik = 0; ik < idKeys.length; ik++) {
          if (idKeys[ik].indexOf('F_res') !== -1) {
            if (!itemExists(renSetY, idKeys[ik]) &&
                            !itemExists(renSetY2, idKeys[ik])) {
              renSetY.push([idKeys[ik]]);
              colAx.push([null]);
              renSetY2.push([]);
              colAx2.push([]);
              yAxisExtent.push(null);
              yAxisLocked.push(false);
              y2AxisExtent.push(null);
              y2AxisLocked.push(false);
            }
          }
        }

        // If after adding possible other default parameters
        // there are no plots added we add en empty plot
        if (renSetY.length === 0) {
          renSetY.push([]);
          colAx.push([]);
          renSetY2.push([]);
          colAx2.push([]);
          yAxisExtent.push(null);
          yAxisLocked.push(false);
          y2AxisExtent.push(null);
          y2AxisLocked.push(false);
        }

        // Check if x axis selection is still available
        if (idKeys.indexOf(this.graph.renderSettings.xAxis) === -1) {
          var oldXVariable = this.graph.renderSettings.xAxis;
          // If not available try Timestamp.
          if (idKeys.indexOf('Timestamp') !== -1) {
            this.graph.renderSettings.xAxis = 'Timestamp';
          } else if (idKeys.length > 0) {
            // If Timestamp not available default to the first key.
            this.graph.renderSettings.xAxis = idKeys[0];
          }
          showMessage('warning', (
            "The variable <b>" + oldXVariable + "</b> " +
                        "is no longer provided by the selected layers. " +
                        "The plot x-axis has been changed to the default <b>"
                        + this.graph.renderSettings.xAxis + "<b>."
          ), 30);
        }


        localStorage.setItem(
          'yAxisSelection',
          JSON.stringify(this.graph.renderSettings.yAxis)
        );
        localStorage.setItem(
          'y2AxisSelection',
          JSON.stringify(this.graph.renderSettings.y2Axis)
        );
        localStorage.setItem(
          'xAxisSelection',
          JSON.stringify(this.graph.renderSettings.xAxis)
        );
        localStorage.setItem(
          'colorAxisSelection',
          JSON.stringify(this.graph.renderSettings.colorAxis)
        );
        localStorage.setItem(
          'colorAxis2Selection',
          JSON.stringify(this.graph.renderSettings.colorAxis2)
        );
        localStorage.setItem(
          'yAxisExtent',
          JSON.stringify(this.graph.renderSettings.yAxisExtent)
        );
        localStorage.setItem(
          'y2AxisExtent',
          JSON.stringify(this.graph.renderSettings.y2AxisExtent)
        );
        localStorage.setItem(
          'yAxisLocked',
          JSON.stringify(this.graph.renderSettings.yAxisLocked)
        );
        localStorage.setItem(
          'y2AxisLocked',
          JSON.stringify(this.graph.renderSettings.y2AxisLocked)
        );

        this.graph.renderSettings.yAxis = renSetY ;
        this.graph.renderSettings.y2Axis = renSetY2;
        this.graph.renderSettings.colorAxis = colAx;
        this.graph.renderSettings.colorAxis2 = colAx2;

        // Save all changes done to plotConfiguration
        var grapRS = this.graph.renderSettings;
        var currL = grapRS.yAxis.length;
        var confArr = [];
        for (var i = 0; i < currL; i++) {
          confArr.push({
            yAxis: grapRS.yAxis[i],
            yAxisLabel: this.graph.yAxisLabel[i],
            y2Axis: grapRS.y2Axis[i],
            y2AxisLabel: this.graph.y2AxisLabel[i],
            colorAxis: grapRS.colorAxis[i],
            colorAxis2: grapRS.colorAxis2[i]
          });
        }

        localStorage.setItem(
          'plotConfiguration', JSON.stringify(confArr)
        );
        this.prevParams = idKeys;

        // End of IF to see if data parameters have changed
      } else if (this.prevParams === null) {
        // TODO: We should not need to do anything here but we
        // could introduce some sanity checks if strange data
        // is loaded for some reason

      } else {
        // TODO: We should not need to do anything here but we
        // could introduce some sanity checks if strange data
        // is loaded for some reason
      }

      this.$('#filterSelectDrop').remove();
      this.$('#filterDivContainer').append('<div id="filterSelectDrop"></div>');

      this.graph.loadData(data.data);
      if (needsResize) {
        this.graph.resize();
      }
      this.filterManager.loadData(data.data);
      this.renderFilterList();
    },

    onChangeAxisParameters: function (selection) {
      this.graph.renderSettings.yAxis = [selection];

      // reset all other plots and configurations
      this.graph.renderSettings.yAxis = [selection];
      this.graph.renderSettings.y2Axis = [[]];
      this.graph.renderSettings.colorAxis = [[null]];
      this.graph.renderSettings.colorAxis2 = [[]];

      // Make sure filters are shown
      var filtersMinimized = localStorage.getItem('filtersMinimized');
      if (filtersMinimized === null) {
        filtersMinimized = false;
      } else {
        filtersMinimized = JSON.parse(filtersMinimized);
      }

      if (filtersMinimized) {
        var height = ($('#graph').height() - 270) + 'px';
        $('#filterSelectDrop').css('opacity', 1.0);
        $('#analyticsFilters').css('opacity', 1.0);
        $('#graph').css('height', height);
        $('#minimizeFilters i').attr('class',
          'fa fa-chevron-circle-down'
        );
        localStorage.setItem(
          'filtersMinimized', JSON.stringify(false)
        );
      }

      this.graph.initAxis();
      this.graph.resize();
      //this.graph.renderData();
    },

    onResize: function () {
      this.graph.resize();
    },

    close: function () {
      if (this.graph) {
        this.graph.destroy();
      }
      delete this.graph;
      this.isClosed = true;
      this.$el.empty();
      this.triggerMethod('view:disconnect');
    }
  });
  return AVView;
});
