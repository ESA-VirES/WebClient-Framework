/* global $ _ define w2popup w2utils showMessage graphly plotty FilterManager */
/* global savePrameterStatus VECTOR_BREAKDOWN */

define(['backbone.marionette',
    'communicator',
    'app',
    //'plotty',
    'models/AVModel',
    'globals',
    'd3',
    'graphly',
    'analytics'
], function (Marionette, Communicator, App, AVModel, globals) {
    'use strict';

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
            "uom": null,
            "name": "Disturbance storm time Index"
        },
        "Kp": {
            "uom": null,
            "name": "Global geomagnetic storm Index"
        },
        "F107": {
            "uom": "1e-22 J/s/m^2/Hz",
            "name": "Observed 10.7cm Solar Radio Flux"
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
                        that.graph.fileSaveString = 'VirES_for_Swarm_' + res;
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
                var data = globals.swarm.get('data');
                if ($('#productSourcesInfoContainer').length) {
                    $('#productSourcesInfoContainer').remove();
                } else {
                    this.createProductSourcesContainer(data);
                }
            }.bind(this));

            if (typeof this.graph === 'undefined') {
                this.$el.append('<div class="d3canvas"></div>');
                this.$('.d3canvas').append('<div id="graph"></div>');
                this.$('.d3canvas').append('<div id="filterDivContainer"></div>');
                this.$('#filterDivContainer').append('<div id="analyticsFilters"></div>');
                this.$el.append('<div id="nodataavailable"></div>');
                $('#nodataavailable').text('No data available for current selection');

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

            //var swarmdata = globals.swarm.get('data'); // not used

            var filterList = localStorage.getItem('selectedFilterList');
            if (filterList !== null) {
                filterList = JSON.parse(filterList);
                this.selectedFilterList = filterList;
            } else {
                this.selectedFilterList = ['F', 'B_N', 'B_E', 'B_C', 'Dst', 'QDLat', 'MLT'];
            }


            // Clone object
            var filtersGlobal = _.clone(globals.swarm.get('uom_set'));
            //filter out periodic latitudes from initial filters
            var filtersNotUsed = ['QDLatitude_periodic', 'Latitude_periodic'];
            var filtersGlobalFiltered = _.filter(filtersGlobal, function (obj, key) {
                if (!filtersNotUsed.some(function (filter) {return key.indexOf(filter) >= 0;})) {
                    // Filter not found in list of not to be used ones
                    return true;
                } else {
                    return false;
                }
            });
            this.filterManager = new FilterManager({
                el: '#analyticsFilters',
                filterSettings: {
                    visibleFilters: this.selectedFilterList,
                    dataSettings: filtersGlobalFiltered,
                    parameterMatrix: {}
                },
                showCloseButtons: true,
                ignoreParameters: '__info__'
            });


            var identifiers = [];
            for (var key in globals.swarm.satellites) {
                if (globals.swarm.satellites[key]) {
                    identifiers.push(key);
                }
            }

            var xax = 'Latitude';
            var xlabel = null;
            var yax = ['F'];
            var yAxisLabel = [];
            var y2ax = [];
            var y2AxisLabel = [];
            var colax = [];
            var colax2 = [];

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

            var cols = [
                'coolwarm', 'rainbow', 'jet', 'diverging_1', 'diverging_2',
                'blackwhite', 'viridis', 'inferno', 'hsv', 'hot', 'cool',
                'spring', 'summer', 'autumn', 'winter', 'bone', 'copper', 'ylgnbu',
                'greens', 'ylorrd', 'bluered', 'portland', 'blackbody', 'earth',
                'electric', 'magma', 'plasma'
            ];

            if (plotty.hasOwnProperty('colorscales')) {
                cols = Object.keys(plotty.colorscales);
            }

            cols = _.sortBy(cols, function (c) {return c;});

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
                ignoreParameters: ['__info__'],
                colorscales: cols
            });

            if (localStorage.getItem('filterSelection') !== null) {
                var filters = JSON.parse(localStorage.getItem('filterSelection'));
                this.filterManager.brushes = filters;
                this.graph.filters = globals.swarm.get('filters');
                this.filterManager.filters = globals.swarm.get('filters');
            }


            this.graph.on('axisChange', function () {

                localStorage.setItem(
                    'xAxisSelection',
                    JSON.stringify(this.renderSettings.xAxis)
                );
                localStorage.setItem(
                    'xAxisLabel',
                    JSON.stringify(this.xAxisLabel)
                );

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

            this.filterManager.on('filterChange', function (filters) {
                localStorage.setItem('filterSelection', JSON.stringify(this.brushes));
                Communicator.mediator.trigger('analytics:set:filter', this.brushes);
                globals.swarm.set({filters: filters});

            });

            this.filterManager.on('removeFilter', function (filter) {
                var index = that.selectedFilterList.indexOf(filter);
                if (index !== -1) {
                    that.selectedFilterList.splice(index, 1);
                    // Check if filter was set
                    if (that.graph.filterManager.filters.hasOwnProperty(filter)) {
                        delete that.graph.filterManager.filters[filter];
                        delete that.graph.filterManager.brushes[filter];
                    }
                    that.graph.filterManager._filtersChanged();
                    localStorage.setItem(
                        'selectedFilterList',
                        JSON.stringify(that.selectedFilterList)
                    );
                    // I can modify options of w2field, but not aUOM, thus rerendering everything in list
                    that.renderFilterList();
                }
            });

            var data = globals.swarm.get('data');
            if (Object.keys(data).length > 0) {
                this.graph.loadData(data);
                this.filterManager.loadData(data);
                $('#nodataavailable').hide();
                $('.d3canvas').show();
                this.renderFilterList();
            }

            this.isClosed = false;

            return this;
        }, //onShow end

        connectDataEvents: function () {
            globals.swarm.on('change:data', this.reloadData.bind(this));
        },

        createProductSourcesContainer: function (data) {
            if (data.hasOwnProperty('__info__')) {
                var infoDat = data.__info__.sources;
                this.$el.append('<div id="productSourcesInfoContainer" class="sourcesInfoContainer"></div>');
                $('#productSourcesInfoContainer').append('<button type="button" class="close" title="Close panel" data-dismiss="alert" aria-hidden="true">&times;</button>');
                $('#productSourcesInfoContainer').append('<h4>Data sources:</h4>');
                $('#productSourcesInfoContainer').append('<ul id="productInfoList"></ul>');
                for (var i = 0; i < infoDat.length; i++) {
                    $('#productInfoList').append(
                        '<li>' + infoDat[i] + '</li>'
                    );
                }
            }
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
                var parameters = product.get('download_parameters') || {};
                _.extend(availableParameters, parameters);
                if (product.get('visible')) {
                    _.extend(activeParameters, parameters);
                }
            });

            // update parameters
            _.each(UPDATED_PARAMETERS, function (values, name) {
                if (availableParameters.hasOwnProperty(name)) {
                    _.extend(availableParameters[name], values);
                }
            });

            // add extra parameters
            _.each(EXTRA_PARAMETERS, function (values, name) {
                availableParameters[name] = _.clone(values);
            });

            // split vectors into their components
            var _splitVector = function (object, vector, components, remove) {
                if (!object.hasOwnProperty(vector)) {return;}
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
                    if (availableParameters.hasOwnProperty(name)) {
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
                var setts = this.graph.filterManager.filterSettings;
                setts.visibleFilters = this.selectedFilterList;
                this.graph.filterManager.updateFilterSettings(setts);
                localStorage.setItem(
                    'selectedFilterList',
                    JSON.stringify(this.selectedFilterList)
                );
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

            var filtersNotUsed = ['QDLatitude_periodic', 'Latitude_periodic'];
            var aUOM = {};
            // Clone object
            _.each(globals.swarm.get('uom_set'), function (obj, key) {
                if (!filtersNotUsed.some(function (filter) {return key.indexOf(filter) >= 0;})) {
                    // Filter not found in list of not to be used ones
                    aUOM[key] = obj;
                }
            });

            // Remove currently visible filters from list
            for (var i = 0; i < this.selectedFilterList.length; i++) {
                if (aUOM.hasOwnProperty(this.selectedFilterList[i])) {
                    delete aUOM[this.selectedFilterList[i]];
                }
            }

            // Show only filters for currently available data
            for (var key in aUOM) {
                if (this.currentKeys && this.currentKeys.indexOf(key) === -1) {
                    delete aUOM[key];
                }
            }

            // Remove unwanted parameters
            if (aUOM.hasOwnProperty('Timestamp')) {delete aUOM.Timestamp;}
            if (aUOM.hasOwnProperty('timestamp')) {delete aUOM.timestamp;}
            if (aUOM.hasOwnProperty('q_NEC_CRF')) {delete aUOM.q_NEC_CRF;}
            if (aUOM.hasOwnProperty('GPS_Position')) {delete aUOM.GPS_Position;}
            if (aUOM.hasOwnProperty('LEO_Position')) {delete aUOM.LEO_Position;}
            if (aUOM.hasOwnProperty('Spacecraft')) {delete aUOM.Spacecraft;}
            if (aUOM.hasOwnProperty('id')) {delete aUOM.id;}

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

            // Check if data source info is open, if yes rerender it
            if ($('#productSourcesInfoContainer').length) {
                $('#productSourcesInfoContainer').remove();
                var productData = globals.swarm.get('data');
                this.createProductSourcesContainer(productData);
            }

            function itemExists(itemArray, item) {
                for (var i = 0; i < itemArray.length; ++i) {
                    for (var j = 0; j < itemArray[i].length; ++j) {
                        if (itemArray[i][j] == item) {
                            return true;
                        }
                    }
                }
                return false;
            }

            // If element already has plot rendering
            if ($(this.el).html()) {
                var idKeys = Object.keys(data);
                this.currentKeys = idKeys;
                if (idKeys.length > 0 && data[idKeys[0]].length > 0) {
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

                    var userVectorBreakDown = globals.userData.getVectorBreakdown();
                    var availableParameters = {};
                    _.each(data.__info__.variables, function (variables, label) {
                        availableParameters[label] = _.flatten(
                            _.map(variables, function (variable) {
                                return (
                                    VECTOR_BREAKDOWN[variable] ||
                                    userVectorBreakDown[variable] ||
                                    [variable]
                                );
                            })
                        );
                    });
                    this.renderSettings.availableParameters = availableParameters;

                    // Calculate very rough estimate of rendered points
                    var dataLength = data[idKeys[0]].length;
                    var renderedPoints = (
                        dataLength * this.renderSettings.yAxis.length
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
                        var filterstouse = [
                            'Ne', 'Te', 'Bubble_Probability',
                            'Relative_STEC_RMS', 'Relative_STEC', 'Absolute_STEC',
                            'Absolute_VTEC', 'Elevation_Angle',
                            'IRC', 'FAC',
                            'EEF'
                        ];

                        filterstouse = filterstouse.concat(['MLT']);
                        var residuals = _.filter(idKeys, function (item) {
                            return item.indexOf('_res_') !== -1;
                        });
                        // If new datasets contains residuals add those instead of normal components
                        if (residuals.length > 0) {
                            filterstouse = filterstouse.concat(residuals);
                        } else {
                            if (filterstouse.indexOf('F') === -1) {
                                filterstouse.push('F');
                            }
                            if (filterstouse.indexOf('F_error') === -1) {
                                filterstouse.push('F_error');
                            }
                        }

                        // Check if configured filters apply to new data
                        for (var fKey in this.graph.filterManager.brushes) {
                            if (idKeys.indexOf(fKey) === -1) {
                                delete this.graph.filterManager.brushes[fKey];
                            }
                        }

                        for (var filKey in this.graph.filterManager.filters) {
                            if (idKeys.indexOf(filKey) === -1) {
                                delete this.graph.filterManager.filters[fKey];
                            }
                        }

                        for (var filgraphKey in this.graph.filters) {
                            if (idKeys.indexOf(filgraphKey) === -1) {
                                delete this.graph.filters[fKey];
                            }
                        }

                        for (var i = filterstouse.length - 1; i >= 0; i--) {
                            if (this.selectedFilterList.indexOf(filterstouse[i]) === -1) {
                                this.selectedFilterList.push(filterstouse[i]);
                            }
                        }
                        var setts = this.graph.filterManager.filterSettings;
                        setts.visibleFilters = this.selectedFilterList;


                        this.graph.filterManager.updateFilterSettings(setts);
                        localStorage.setItem(
                            'selectedFilterList',
                            JSON.stringify(this.selectedFilterList)
                        );
                        this.renderFilterList();
                        //localStorage.setItem('selectedFilterList', JSON.stringify(filterstouse));

                        // Check if we want to change the y-selection
                        // If previous does not contain key data and new one
                        // does we add key parameter to selection in plot
                        var parasToCheck = [
                            'Ne', 'F', 'Bubble_Probability', 'Absolute_STEC',
                            'FAC', 'EEF'
                        ];

                        // Go trough all plots and see if they need to be removed
                        // now that data has changed
                        var renSetY = this.renderSettings.yAxis;
                        var renSetY2 = this.renderSettings.y2Axis;
                        var colAx = this.renderSettings.colorAxis;
                        var colAx2 = this.renderSettings.colorAxis2;

                        for (var pY = renSetY.length - 1; pY >= 0; pY--) {

                            // Go through all elements of plot, first left y axis
                            // and remove them if no longer available
                            for (var yy = renSetY[pY].length - 1; yy >= 0; yy--) {
                                if (idKeys.indexOf(renSetY[pY][yy]) === -1) {
                                    renSetY[pY].splice(yy, 1);
                                    // remove corresponding cs
                                    colAx[pY].splice(yy, 1);
                                }
                            }

                            // Go through all elements of plot, now right y axis
                            // and remove them if no longer available
                            for (var yy2 = renSetY2[pY].length - 1; yy2 >= 0; yy2--) {
                                if (idKeys.indexOf(renSetY2[pY][yy2]) === -1) {
                                    renSetY2[pY].splice(yy2, 1);
                                    // remove corresponding cs
                                    colAx2[pY].splice(yy2, 1);
                                }
                            }

                            // Chech if both left and right are empty we remove
                            // the complete plot
                            if (renSetY[pY].length === 0 && renSetY2[pY].length === 0) {
                                renSetY.splice(pY, 1);
                                renSetY2.splice(pY, 1);
                                colAx.splice(pY, 1);
                                colAx2.splice(pY, 1);
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

                        this.graph.renderSettings.yAxis = renSetY ;
                        this.graph.renderSettings.y2Axis = renSetY2;
                        this.graph.renderSettings.colorAxis = colAx;
                        this.graph.renderSettings.colorAxis2 = colAx2;

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

                    // This should only happen here if there has been
                    // some issue with the saved filter configuration
                    // Check if current brushes are valid for current data
                    for (var fKey in this.graph.filterManager.brushes) {
                        if (idKeys.indexOf(fKey) === -1) {
                            delete this.graph.filterManager.brushes[fKey];
                        }
                    }

                    this.prevParams = idKeys;

                    this.$('#filterSelectDrop').remove();
                    this.$('#filterDivContainer').append('<div id="filterSelectDrop"></div>');



                    this.graph.loadData(data);
                    if (needsResize) {
                        this.graph.resize();
                    }
                    this.filterManager.loadData(data);
                    this.renderFilterList();
                } else {
                    $('#nodataavailable').show();
                    $('.d3canvas').hide();
                }
            }
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
