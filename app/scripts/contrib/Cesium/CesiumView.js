/*global $ _ define d3 Cesium msgpack plotty DrawHelper saveAs showMessage */
/*global defaultFor getISODateTimeString meanDate */
/*global TIMESTAMP SCALAR_PARAM VECTOR_PARAM */
/*global has get pop setDefault isNumber Timer */

define([
    'backbone.marionette',
    'communicator',
    'app',
    'models/MapModel',
    'globals',
    'msgpack',
    'httpRequest',
    'dataUtil',
    'hbs!tmpl/wps_eval_composed_model',
    'hbs!tmpl/wps_get_field_lines',
    'hbs!tmpl/FieldlinesLabel',
    'hbs!tmpl/wps_fetchData',
    'colormap',
    'cesium/Cesium',
    'drawhelper',
    'FileSaver',
], function (
    Marionette, Communicator, App, MapModel, globals, msgpack, httpRequest,
    DataUtil, tmplEvalModel, tmplGetFieldLines, tmplFieldLinesLabel, wps_fetchDataTmpl,
    colormap
) {
    'use strict';

    var SYMBOLS = new (function () {
        _.extend(this, {
            counter: 0,
            symbols: {},
            loaded: function () {
                return this.counter < 1;
            },
            get: function (name) {
                return get(this.symbols, name);
            },
            set: function (name, source) {
                var timer = new Timer();
                var image = new Image();
                image.onload = _.bind(function () {
                    this.counter -= 1;
                    timer.logEllapsedTime(name + " symbol load time:");
                }, this);
                this.counter += 1;
                image.src = source;
                this.symbols[name] = image;
            },
        });
    })();

    var _SVG_HEAD = 'data:image/svg+xml,<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="40px" height="40px" xml:space="preserve">';
    var _SVG_TAIL = '</svg>';

    SYMBOLS.set('SQUARE', _SVG_HEAD + '<rect y="10" x="10" height="20" width="20" stroke="black" stroke-width="3" fill="transparent"/>' + _SVG_TAIL);
    SYMBOLS.set('DIMOND', _SVG_HEAD + '<path d="M 5.86,20, 20,5.86 34.14,20 20,34.14 Z" stroke="black" stroke-width="3" fill="transparent"/>' + _SVG_TAIL);
    SYMBOLS.set('LARGE_DIMOND', _SVG_HEAD + '<path d="M 3,20, 20,3 37,20 20,37 Z" stroke="black" stroke-width="4" fill="transparent"/>' + _SVG_TAIL);
    SYMBOLS.set('TRIANGLE', _SVG_HEAD + '<path d="M 7.75,27.07 32.25,27.07 20,5.86 Z" stroke="black" stroke-width="3" fill="transparent"/>' + _SVG_TAIL);
    SYMBOLS.set('CIRCLE', _SVG_HEAD + '<circle cx="20" cy="20" r="10" stroke="black" stroke-width="3" fill="transparent"/>' + _SVG_TAIL);

    var DEG2RAD = Math.PI / 180.0;

    var DEFAULT_POINT_PIXEL_SIZE = 8;

    var NEAR_FAR_SCALAR = new Cesium.NearFarScalar(1.0e2, 4, 14.0e6, 0.8);

    var HEIGHT_OFFSET = 210000; //m

    var EARTH_RADIUS = 6371000; // m
    var SWARM_ALTITUDE = 450000; // m
    var IONOSPHERIC_ALTITUDE = 110000; // m
    var DEFAULT_NOMINAL_RADIUS = EARTH_RADIUS + SWARM_ALTITUDE;
    var NOMINAL_RADIUS = {
        'J_T_NE': EARTH_RADIUS + IONOSPHERIC_ALTITUDE,
        'J_DF_NE': EARTH_RADIUS + IONOSPHERIC_ALTITUDE,
        'J_CF_NE': EARTH_RADIUS + IONOSPHERIC_ALTITUDE,
        'J_DF_SemiQD': EARTH_RADIUS + IONOSPHERIC_ALTITUDE,
        'J_CF_SemiQD': EARTH_RADIUS + IONOSPHERIC_ALTITUDE,
        'J_R': EARTH_RADIUS + IONOSPHERIC_ALTITUDE,
    };

    var DEFAULT_NOMINAL_PRODUCT_LEVEL = 4;
    var NOMINAL_PRODUCT_LEVEL = {
        "SW_OPER_AEJALPS_2F": 1,
        "SW_OPER_AEJBLPS_2F": 1,
        "SW_OPER_AEJCLPS_2F": 1,
        "SW_OPER_AEJULPS_2F": 1,
    };
    var FIXED_HEIGHT_PRODUCT = [
        "SW_OPER_AEJALPS_2F", "SW_OPER_AEJBLPS_2F", "SW_OPER_AEJCLPS_2F", "SW_OPER_AEJULPS_2F",
        "SW_OPER_AEJALPL_2F", "SW_OPER_AEJBLPL_2F", "SW_OPER_AEJCLPL_2F", "SW_OPER_AEJULPL_2F",
    ];


    var TEC_VECTOR_SAMPLING = 40000; // ms
    var TEC_VECTOR_LENGTH = 500000; // m - length of the normalized TEC vectors
    var MAX_VECTOR_LENGTH = 600000; // m - length of the longest regular vector
    var JNE_VECTOR_SAMPLING = 5000; // ms
    var NEC_VECTOR_SAMPLING = 5000; // ms

    var BUBLE_PROBABILITY_THRESHOLD = 0.1;

    var PT_POINT_TYPE_MASK = 0x2;
    var PT_BOUNDARY = 0x2;
    var PT_PEAK = 0x0;

    // record filter class
    var RecordFilter = function (variables) {
        // get subset of applicable global filters
        this.filters = _.map(
            _.pick(globals.swarm.get('filters') || {}, variables),
            function (filter, variable) {
                return function (record) {
                    return filter(record[variable]);
                };
            }
        );

        // add extra filter removing invalid coordinates
        this.addFilter(function (record) {
            return (
                isNumber(record.Latitude) &&
                isNumber(record.Longitude) &&
                (record.Radius === undefined || isNumber(record.Radius))
            );
        });
    };

    RecordFilter.prototype = {
        addFilter: function (filter) {
            // Add new filter function.
            this.filters.push(filter);
        },
        match: function (record) {
            // Return true if the record has been matched by the filter.
            for (var i = 0; i < this.filters.length; i++) {
                if (!this.filters[i](record)) {
                    return false;
                }
            }
            return true;
        }
    };

    // time sub-sampler
    var Subsampler = function (timeInterval) {
        this.timeInterval = timeInterval;
        this.lastTime = null;
    };
    Subsampler.prototype = {
        testSample: function (time) {
            var dTime = time - this.lastTime;
            var passes = (
                this.lastTime === null ||
                dTime <= 0 || dTime >= this.timeInterval
            );
            if (passes) {this.lastTime = time;}
            return passes;
        }
    };

    // vector norm calculation

    var vnorm2 = function (x, y) {return Math.sqrt(x * x + y * y);};
    var vnorm3 = function (x, y, z) {return Math.sqrt(x * x + y * y + z * z);};

    var VectorNorms = function () {
        this.maxNorm = 0;
        this.norms = [];
    };
    VectorNorms.prototype = {
        push: function (norm) {
            this.norms.push(norm);
            if (norm > this.maxNorm) {
                this.maxNorm = norm;
            }
        }
    };

    // vector norms cache preventing repeated calculation
    var CachedVectorNorms = function () {
        this._cache = {};
    };

    CachedVectorNorms.prototype = {

        getVectorNorms: function (parameter, data) {
            var vnorms = get(this._cache, parameter);
            if (!vnorms) {
                vnorms = this._calculateVectorNorms(data);
                this._cache[parameter] = vnorms;
            }
            return vnorms;
        },

        _calculateVectorNorms: function (data) {
            switch (data.length) {
                case 2:
                    return this._calculateV2Norms(data[0], data[1]);
                case 3:
                    return this._calculateV3Norms(data[0], data[1], data[2]);
                default:
                    throw "Unsupported vector lenght " + data.lenght + "!";
            }
        },

        _calculateV2Norms: function (x, y) {
            var norms = new VectorNorms();
            for (var i = 0, size = x.length; i < size; i++) {
                norms.push(vnorm2(x[i], y[i]));
            }
            return norms;
        },

        _calculateV3Norms: function (x, y, z) {
            var norms = new VectorNorms();
            for (var i = 0, size = x.length; i < size; i++) {
                norms.push(vnorm3(x[i], y[i], z[i]));
            }
            return norms;
        }
    };

    var convertSpherical2Cartesian = function (latitude, longitude, radius) {
        // convert geocentric spherical coordinates to Cartesian
        var r_sin_lat = Math.sin(DEG2RAD * latitude) * radius;
        var r_cos_lat = Math.cos(DEG2RAD * latitude) * radius;
        var sin_lon = Math.sin(DEG2RAD * longitude);
        var cos_lon = Math.cos(DEG2RAD * longitude);

        return {
            x: r_cos_lat * cos_lon,
            y: r_cos_lat * sin_lon,
            z: r_sin_lat
        };
    };

    var rotateHorizontal2Cartesian = function (latitude, longitude, vN, vE, vR) {
        // rotate vector from a local horizontal North, East, Radius frame
        // defined by the latitude and longitude to the global geocentric
        // Cartesian frame
        var sin_lat = Math.sin(DEG2RAD * latitude);
        var cos_lat = Math.cos(DEG2RAD * latitude);
        var sin_lon = Math.sin(DEG2RAD * longitude);
        var cos_lon = Math.cos(DEG2RAD * longitude);

        var vXY = cos_lat * vR - sin_lat * vN;
        return {
            x: cos_lon * vXY - sin_lon * vE,
            y: sin_lon * vXY + cos_lon * vE,
            z: cos_lat * vN + sin_lat * vR,
        };
    };


    // Feature collection manager encapsulates details of the handling
    // of the active feature collections.
    var FeatureCollectionManager = function (primitives) {
        this.primitives = primitives;
        this.visibleCollections = {};
        this.newCollections = {};
    };

    FeatureCollectionManager.prototype = {

        _removeVisible: function (name) {
            var collection = pop(this.visibleCollections, name);
            if (collection) {
                this.primitives.remove(collection);
            }
        },

        _addVisible: function (name, collection) {
            if (collection) {
                this.primitives.add(collection);
                this.visibleCollections[name] = collection;
            }
        },

        list: function () {
            // list collection names
            return _.keys(_.extend({}, this.visibleCollections, this.newCollections));
        },

        contains: function (name) {
            // return true if named feature collection exists or false otherwise
            return has(this.visibleCollections, name) || has(this.newCollections, name);
        },

        get: function (name) {
            // return an existing named feature collection or undefined
            return get(this.visibleCollections, name) || get(this.newCollections, name);
        },

        add: function (name, collection) {
            // add a new not-yet-visible named feature collection
            this._removeVisible(name);
            this.newCollections[name] = collection;
        },

        show: function (name) {
            // show a new not-yet-visible named collection on the map
            this._removeVisible(name);
            this._addVisible(name, pop(this.newCollections, name));
        },

        showAll: function () {
            // show all feature collections on the map
            _.each(_.keys(this.newCollections), this.show, this);
        },

        remove: function (name) {
            // remove an existing named feature collection
            this._removeVisible(name);
            pop(this.newCollections, name);
        },

        removeAll: function () {
            // remove all feature collections
            this.newCollections = {};
            _.each(_.keys(this.visibleCollections), this._removeVisible, this);
        }
    };

    // Cesium overlay control class
    var CesiumOverlayControl = function (primitives, options) {
        options = options || {};
        this.primitives = primitives;
        this.setOffset(
            get(options, 'xOffset', 0),
            get(options, 'yOffset', 0)
        );
    };

    CesiumOverlayControl.prototype = {

        setOffset: function (xOffset, yOffset) {
            // set global offset
            this.xOffset = xOffset;
            this.yOffset = yOffset;
        },

        removeItem: function (item) {
            this.primitives.remove(item.primitive);
            this._removeTooltip(item);
        },

        addItem: function (item) {
            item.primitive = this.primitives.add(
                this._createViewportQuad(
                    item.dataUrl,
                    this.xOffset + item.xOffset,
                    this.yOffset + item.yOffset,
                    item.width,
                    item.height
                )
            );
            this._createTooltip(item);
        },

        isItemDisplayed: function (item) {
            return this.primitives.contains(item.primitive);
        },

        _createViewportQuad: function (img, x, y, width, height) {
            var newmat = new Cesium.Material.fromType('Image', {
                image: img,
                color: new Cesium.Color(1, 1, 1, 1),
            });
            return new Cesium.ViewportQuad(
                new Cesium.BoundingRectangle(x, y, width, height), newmat
            );
        },

        _createTooltip: function (item) {
            var tooltip = item.tooltip;
            if (!tooltip) {return;}
            tooltip.id = this._getTooltipId(item.id);
            tooltip.element.find('#' + tooltip.id).remove();
            var bottom = (
                this.yOffset + item.yOffset +
                parseInt($('.cesium-viewer').css('padding-bottom'), 10)
            );
            var left = (
                this.xOffset + item.xOffset +
                parseInt($('.cesium-viewer').css('padding-left'), 10)
            );
            tooltip.element.append(
                '<div class="' + tooltip['class'] + '" id="' + tooltip.id +
                '" style="' + (
                    'position:absolute;' +
                    'bottom:' + bottom + 'px;' +
                    'left:' + left + 'px;' +
                    'width:' + item.width + 'px;' +
                    'height:' + item.height + 'px;'
                ) + '" title="' + tooltip.text + '"></div>'
            );
        },

        _removeTooltip: function (item) {
            var tooltip = item.tooltip;
            if (tooltip && tooltip.id) {
                tooltip.element.find('#' + tooltip.id).remove();
            }
        },

        _getTooltipId: function (id) {
            return "tooltip_" + encodeURIComponent(id).replace(/%/g, '-');
        },
    };


    // Color-scale manager encapsulates details of the composition
    // of the color-scale legend.
    var ColorScaleManager = function (primitives, renderer, options) {
        this.renderer = renderer;
        this.parameters = {};
        this.colorscales = {};
        this.overlay = new CesiumOverlayControl(primitives, options);
    };

    ColorScaleManager.prototype = {

        refresh: function () {
            // group products variables
            var orderedIds = _.flatten(_.map(
                this.parameters,
                function (parameters, productId) {
                    return _.map(parameters, function (parameter) {
                        return productId + '|' + parameter;
                    });
                }
            ));

            // re-render items
            var yOffset = 0;
            _.each(orderedIds, function (id) {
                var colorscale = this.colorscales[id];
                var isDisplayed = this.overlay.isItemDisplayed(colorscale);
                if (isDisplayed && colorscale.yOffset !== yOffset) {
                    this.overlay.removeItem(colorscale);
                    isDisplayed = false;
                }
                if (!isDisplayed) {
                    colorscale.yOffset = yOffset;
                    this.overlay.addItem(colorscale);
                }
                yOffset += colorscale.height;
            }, this);
        },

        update: function (product, parameters) {
            var currentParameters = get(this.parameters, product.id) || [];

            _.each(currentParameters, function (parameter) {
                this.remove(product.id + '|' + parameter);
            }, this);

            _.each(parameters, function (parameter) {
                this.create(product.id + '|' + parameter, product, parameter);
            }, this);

            if (parameters.length > 0) {
                this.parameters[product.id] = parameters;
            } else {
                delete this.parameters[product.id];
            }
        },

        remove: function (id) {
            this.overlay.removeItem(pop(this.colorscales, id));
        },

        create: function (id, product, parameter) {
            var colorscale = _.extend({
                id: id,
                xOffset: 0,
                yOffset: 0,
            }, this.renderer(product, parameter));
            this.colorscales[colorscale.id] = colorscale;
        },
    };


    // Legend manager encapsulates details of the composition of the data legend.
    var DataLegendManager = function (primitives, renderer, options) {
        this.isVisible = pop(options, 'isVisible', true);
        this.renderer = renderer;
        this.products = {};
        this.items = {};
        this.overlay = new CesiumOverlayControl(primitives, options);
    };

    DataLegendManager.prototype = {

        toggleLegendVisibility: function () {
            this.setVisibility(!this.isVisible);
        },

        showLegend: function () {
            this.setVisibility(true);
        },

        hideLegend: function () {
            this.setVisibility(false);
        },

        setLegendVisibility: function (isVisible) {
            this.isVisible = isVisible;
            this.refresh();
        },

        refresh: function () {
            if (this.isVisible) {
                this._render();
            } else {
                this._clear();
            }
        },

        _render: function () {
            // re-render items
            var yOffset = 0;
            _.each(this.items, function (item) {
                var isDisplayed = this.overlay.isItemDisplayed(item);
                if (isDisplayed && item.yOffset !== yOffset) {
                    this.overlay.removeItem(item);
                    isDisplayed = false;
                }
                if (!isDisplayed) {
                    item.yOffset = yOffset;
                    this.overlay.addItem(item);
                }
                yOffset += item.height;
            }, this);
        },

        _clear: function () {
            _.each(this.items, function (item) {
                var isDisplayed = this.overlay.isItemDisplayed(item);
                if (isDisplayed) {
                    this.overlay.removeItem(item);
                }
            }, this);
        },

        addProductTypeItem: function (productType, id, options) {
            this.create(id, options);
            setDefault(this.products, productType, []);
            this.products[productType].push(id);
        },

        removeProductTypeItems: function (productType) {
            pop(this.products, productType);
            _.each(_.difference(
                _.keys(this.items),
                _.uniq(_.flatten(_.values(this.products)))
            ), this.remove, this);
        },

        remove: function (id) {
            this.overlay.removeItem(pop(this.items, id));
        },

        create: function (id, options) {
            if (!has(this.items, id)) {
                var item = _.extend({
                    id: id,
                    xOffset: 0,
                    yOffset: 0,
                }, this.renderer(id, options));
                this.items[id] = item;
            }
        },

        removeAll: function () {
            _.each(_.key(this.items), this.remove, this);
        },
    };


    var CesiumView = Marionette.View.extend({
        model: new MapModel.MapModel(),

        initialize: function (options) {
            this.sceneModeMatrix = {
                'columbus': 1,
                '2dview': 2,
                'globe': 3
            },
            this.sceneModeMatrixReverse = {
                1: 'columbus',
                2: '2dview',
                3: 'globe'
            },
            this.map = undefined;
            this.isClosed = true;
            this.tileManager = options.tileManager;
            this.selectionType = null;
            //this.overlayIndex = 99;
            ///this.diffimageIndex = this.overlayIndex - 10;
            //this.diffOverlay = null;
            //this.overlayLayers = [];
            //this.overlayOffset = 100;
            this.cameraIsMoving = false;
            this.cameraLastPosition = null;
            this.billboards = null;
            this.FLbillboards = null;
            this.activeFL = [];
            this.FLCollection = {};
            this.FLData = {};
            this.FLStoredData = {};
            this.bboxsel = null;
            this.extentPrimitive = null;
            this.activeModels = [];
            this.beginTime = null;
            this.endTime = null;
            this.featureCollections = null;
            this.relatedFeatureCollections = null;
            this.colorScales = null;
            this.dataLegends = null;

            this.connectDataEvents();
        },

        createMap: function () {
            // Problem arose in some browsers where aspect ratio was kept not adapting
            // to height; Added height style attribute to 100% to solve problem
            this.$el.attr('style', 'height:100%;');

            // TODO: We dont use bing maps layer, but it still reports use of default key in console.
            // For now we just set it to something else just in case.
            Cesium.BingMapsApi.defaultKey = 'NOTHING';
            Cesium.Camera.DEFAULT_VIEW_RECTANGLE = Cesium.Rectangle.fromDegrees(0.0, 0.0, 40.0, 60.0);

            Cesium.WebMapServiceImageryProvider.prototype.updateProperties = function (property, value) {
                property = '&' + property + '=';
                value = '' + value;
                var index = _.indexOf(this._tileProvider._urlParts, property);
                if (index >= 0) {
                    this._tileProvider._urlParts[index + 1] = encodeURIComponent(value);
                } else {
                    this._tileProvider._urlParts.push(property);
                    this._tileProvider._urlParts.push(encodeURIComponent(value));
                }
            };

            this.$el.append('<div id="fieldlines_label" class="hidden"></div>');
            this.$el.append('<div id="coordinates_label"></div>');
            this.$el.append('<div id="cesium_attribution"></div>');
            this.$el.append('<div id="cesium_custom_attribution"></div>');
            $('#cesium_custom_attribution').append(
                '<div style="float:left"><a href="http://cesiumjs.org" target="_blank">Cesium</a>' +
                '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>'
            );

            this.$el.append('<div type="button" class="btn btn-success darkbutton" id="cesium_save">Save as Image</div>');
            this.$el.append('<div type="button" class="btn btn-success darkbutton"  id="bb_selection">Select Area</div>');

            this.$el.append('<div id="poleViewDiv"></div>');
            $('#poleViewDiv').append('<button class="btn btn-success darkbutton dropdown-toggle" title="Pole View Selection" id="poleViewButton" data-toggle="dropdown">Globe View</button>');
            $('#poleViewDiv').append('<ul id="poleViewUl" class="dropdown-menu"></ul>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton magN poleButton" title="Magnetic North Pole">Mag. North</button></li>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton magS poleButton" title="Magnetic South Pole">Mag. South</button></li>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton geoN poleButton" title="Geographic North Pole">Geo. North</button></li>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton geoS poleButton" title="Geographic South Pole">Geo. South</button></li>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton poleButton" id="resetCameraView" title="Reset to the free Globe View.">Reset View</button></li>');

            this.bindPolarButtons();

            this.$el.append('<input type="text" class="bboxEdit hidden"  id="bboxWestForm" placeholder="West">');
            this.$el.append('<input type="text" class="bboxEdit hidden"  id="bboxEastForm" placeholder="East">');
            this.$el.append('<input type="text" class="bboxEdit hidden"  id="bboxNorthForm" placeholder="North">');
            this.$el.append('<input type="text" class="bboxEdit hidden"  id="bboxSouthForm" placeholder="South">');
            this.fillBboxForms();
            this.$el.append('<input type="button" class="bboxEdit hidden"  id="bboxEditConfirm" value="✔">');
            // hide cesium tooltip on hover over the forms
            $(".bboxEdit").hover(function () {
                $(".twipsy").addClass("hidden");
            }, function () {
                $(".twipsy").removeClass("hidden");
            });
            $("#bboxEditConfirm").click(this.submitCoordinateForms.bind(this));
            $(".bboxEdit").keypress(function (evt) {
                // confirm forms on enter too
                if (evt.keyCode === 13) {
                    this.submitCoordinateForms();
                }
            }.bind(this));

            this.colors = globals.objects.get('color');

            if (this.beginTime === null || this.endTime === null) {
                var selTime = Communicator.reqres.request('get:time');
                this.beginTime = selTime.start;
                this.endTime = selTime.end;
            }

            var baseLayers = [];
            var initialLayer = null;
            globals.baseLayers.each(function (baselayer) {
                var layer = this.createLayer(baselayer);
                baseLayers.push(layer);
                if (baselayer.get('visible')) {
                    initialLayer = layer;
                }
            }, this);

            var clock = new Cesium.Clock({
                startTime: Cesium.JulianDate.fromIso8601('2014-01-01'),
                currentTime: Cesium.JulianDate.fromIso8601('2014-01-02'),
                stopTime: Cesium.JulianDate.fromIso8601('2014-01-03'),
                clockRange: Cesium.ClockRange.LOOP_STOP,
                clockStep: Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER,
                canAnimate: false,
                shouldAnimate: false
            });

            if (initialLayer) {
                var options = {
                    timeline: false,
                    fullscreenButton: false,
                    baseLayerPicker: false,
                    homeButton: false,
                    infoBox: false,
                    navigationHelpButton: false,
                    navigationInstructionsInitiallyVisible: false,
                    animation: false,
                    imageryProvider: initialLayer,
                    /*terrainProvider: new Cesium.CesiumTerrainProvider({
                        url: '//dem.maps.eox.at/'
                    }),*/
                    creditContainer: 'cesium_attribution',
                    contextOptions: {webgl: {preserveDrawingBuffer: true}},
                    clock: clock
                };
                //COLUMBUS_VIEW SCENE2D SCENE3D
                if (localStorage.getItem('mapSceneMode') !== null) {
                    options.sceneMode = this.sceneModeMatrix[
                        JSON.parse(localStorage.getItem('mapSceneMode'))
                    ];
                    if (options.sceneMode !== 3) {
                        $('#poleViewDiv').addClass("hidden");
                    }
                }
                this.map = new Cesium.Viewer(this.el, options);
                var initialCesiumLayer = this.map.imageryLayers.get(0);

                this.featureCollections = new FeatureCollectionManager(
                    this.map.scene.primitives
                );
                this.relatedFeatureCollections = new FeatureCollectionManager(
                    this.map.scene.primitives
                );
                this.colorScales = new ColorScaleManager(
                    this.map.scene.primitives,
                    _.bind(this.renderColorScale, this),
                    {yOffset: 5}
                );
                this.dataLegends = new DataLegendManager(
                    this.map.scene.primitives,
                    _.bind(this.renderDataLegend, this),
                    {xOffset: 300, yOffset: 5}
                );
            }

            if (localStorage.getItem('cameraPosition') !== null) {
                var c = JSON.parse(localStorage.getItem('cameraPosition'));
                this.map.scene.camera.position = new Cesium.Cartesian3(
                    c.position[0], c.position[1], c.position[2]
                );
                this.map.scene.camera.direction = new Cesium.Cartesian3(
                    c.direction[0], c.direction[1], c.direction[2]
                );
                this.map.scene.camera.up = new Cesium.Cartesian3(
                    c.up[0], c.up[1], c.up[2]
                );
                this.map.scene.camera.right = new Cesium.Cartesian3(
                    c.right[0], c.right[1], c.right[2]
                );

                if (options.sceneMode === 2) {

                    var frustum = JSON.parse(localStorage.getItem('frustum'));
                    if (frustum) {
                        this.map.scene.camera.frustum.right = frustum.right;
                        this.map.scene.camera.frustum.left = frustum.left;
                        this.map.scene.camera.frustum.top = frustum.top;
                        this.map.scene.camera.frustum.bottom = frustum.bottom;
                    }
                }
            } else {
                // set initial camera this way, so we can reset to the exactly same values later on
                this.resetInitialView();
            }

            var mm = globals.objects.get('mapmodel');

            this.navigationhelp = new Cesium.NavigationHelpButton({
                container: $('.cesium-viewer-toolbar')[0]
            });

            this.map.scene.morphStart.addEventListener(function () {
                this.globalViewZoomReset();
            }.bind(this));

            this.map.scene.morphComplete.addEventListener(function () {
                // change of mode event handler
                if (this.map._sceneModePicker.viewModel.sceneMode !== 3) {
                    $('#poleViewDiv').addClass("hidden");
                } else {
                    $('#poleViewDiv').removeClass("hidden");
                    setTimeout(this.resetInitialView.bind(this), 500);
                }
            }.bind(this));

            this.map.scene.skyBox.show = mm.get('skyBox');
            this.map.scene.sun.show = mm.get('sun');
            this.map.scene.moon.show = mm.get('moon');
            this.map.scene.skyAtmosphere.show = mm.get('skyAtmosphere');
            this.map.scene.backgroundColor = new Cesium.Color.fromCssColorString(
                mm.get('backgroundColor')
            );

            // TODO: Removes fog for now as it is not very good at this point
            if (this.map.scene.hasOwnProperty('fog')) {
                this.map.scene.fog.enabled = false;
            }

            // Remove gazetteer field
            $('.cesium-viewer-geocoderContainer').remove();

            // Show Wireframe (Debug help)
            //this.map.scene.globe._surface._tileProvider._debug.wireframe = true;

            var handler = new Cesium.ScreenSpaceEventHandler(
                this.map.scene.canvas
            );
            handler.setInputAction(function () {
                //hide the selectionIndicator
                this.map.selectionIndicator.viewModel.selectionIndicatorElement.style.visibility = 'hidden';
            }.bind(this), Cesium.ScreenSpaceEventType.LEFT_CLICK);

            handler.setInputAction(function (movement) {
                var ellipsoid = Cesium.Ellipsoid.WGS84;
                var position = this.map.scene.camera.pickEllipsoid(movement.endPosition, ellipsoid);
                $('#coordinates_label').hide();
                if (Cesium.defined(position)) {
                    var cartographic = ellipsoid.cartesianToCartographic(position);
                    var lat = Cesium.Math.toDegrees(cartographic.latitude);
                    var lon = Cesium.Math.toDegrees(cartographic.longitude);
                    //var height = cartographic.height;
                    $('#coordinates_label').show();
                    $('#coordinates_label').html(
                        'Lat: ' + lat.toFixed(4) + '</br>Lon: ' + lon.toFixed(4)
                    );
                    // prefill coordinates in bbox edit forms when user already clicked on map to draw a rectangle
                    if ($('#bb_selection').text() === "Deactivate") {
                        if ($('.twipsy-inner p').length === 2) {
                            // could not find a way to hook up on events of external cesium drawing plugin, so watching for when a new tooltip appears
                            if (this.bboxEdit === undefined) {
                                // first click on globe, save start
                                this.bboxEdit = {};
                                this.bboxEdit.n = lat;
                                this.bboxEdit.w = lon;
                            } else {
                                // all other mouse movements, save second border, recompute bbox if necessary and save to forms
                                this.bboxEdit.e = lon;
                                this.bboxEdit.s = lat;
                                this.fillBboxFormsWhileDrawing(this.bboxEdit);
                            }
                        }

                    }
                }
            }.bind(this), Cesium.ScreenSpaceEventType.MOUSE_MOVE);

            this.billboards = this.map.scene.primitives.add(
                new Cesium.BillboardCollection()
            );
            this.FLbillboards = this.map.scene.primitives.add(
                new Cesium.BillboardCollection()
            );
            this.drawhelper = new DrawHelper(this.map.cesiumWidget);
            // It seems that if handlers are active directly there are some
            // object deleted issues when the draw helper tries to pick elements
            // in the scene; Setting handlers muted in the beginning seems to
            // solve the issue.
            this.drawhelper._handlersMuted = true;

            this.cameraLastPosition = {
                x: this.map.scene.camera.position.x,
                y: this.map.scene.camera.position.y,
                z: this.map.scene.camera.position.z
            };

            // Extend far clipping for fieldlines
            this.map.scene.camera.frustum.far *= 15;

            this.map.clock.onTick.addEventListener(this.handleTick.bind(this));

            //Go through all defined baselayer and add them to the map
            for (var i = 0; i < baseLayers.length; i++) {
                globals.baseLayers.each(function (baselayer) {
                    if (initialLayer._layer === baselayer.get('views')[0].id) {
                        baselayer._cesiumLayer = initialCesiumLayer;
                    } else {
                        if (baseLayers[i]._layer === baselayer.get('views')[0].id) {
                            var imagerylayer = this.map.scene.imageryLayers.addImageryProvider(baseLayers[i]);
                            imagerylayer.show = baselayer.get('visible');
                            baselayer._cesiumLayer = imagerylayer;
                        }
                    }
                }, this);
            }

            // Go through all products and add them to the map
            _.each(
                globals.products.last(globals.products.length).reverse(),
                function (product) {
                    var layer = this.createLayer(product);
                    if (!layer) return;
                    var imagerylayer = this.map.scene.imageryLayers.addImageryProvider(layer);
                    product._cesiumLayer = imagerylayer;

                    imagerylayer.show = product.get('visible');
                    imagerylayer.alpha = product.get('opacity');

                    // If product protocol is not WMS or WMTS they are
                    // shown differently so dont activate 'dummy' layers
                    if (product.get('views')[0].protocol !== 'WMS' &&
                        product.get('views')[0].protocol !== 'WMTS') {
                        imagerylayer.show = false;
                    }
                    // If product is model and active parameters is Fieldline
                    // do not activate dummy layer and check for fieldlines
                    if (product.get('model')) {
                        var activeKey = this.getSelectedVariable(product.get('parameters'));
                        if (activeKey === 'Fieldlines') {
                            imagerylayer.show = false;
                        }
                        // add extra later for the custom model
                        imagerylayer = this.map.scene.imageryLayers.addImageryProvider(this.createWPSLayer());
                        imagerylayer.show = false;
                        product._cesiumLayerCustom = imagerylayer;
                    }
                }, this
            );

            // Go through all overlays and add them to the map
            globals.overlays.each(function (overlay) {
                var layer = this.createLayer(overlay);
                if (layer) {
                    var imagerylayer = this.map.scene.imageryLayers.addImageryProvider(layer);
                    imagerylayer.show = overlay.get('visible');
                    overlay._cesiumLayer = imagerylayer;
                }
            }, this);

            this.map.scene.morphComplete.addEventListener(function () {
                localStorage.setItem(
                    'mapSceneMode',
                    JSON.stringify(
                        this.sceneModeMatrixReverse[this.map.scene.mode]
                    )
                );
                var c = this.map.scene.camera;
                localStorage.setItem('cameraPosition',
                    JSON.stringify({
                        position: [c.position.x, c.position.y, c.position.z],
                        direction: [c.direction.x, c.direction.y, c.direction.z],
                        up: [c.up.x, c.up.y, c.up.z],
                        right: [c.right.x, c.right.y, c.right.z]
                    })
                );
            }, this);
            // add event handler for fieldlines click
            var scene = this.map.scene;
            var handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
            handler.setInputAction(function (click) {
                var pickedObject = scene.pick(click.position);
                if (Cesium.defined(pickedObject) && typeof pickedObject.id !== 'undefined' && pickedObject.id.toString().indexOf('vec_line_fl') !== -1) {
                    this.onFieldlineClicked(pickedObject, click.position);
                } else {
                    this.hideFieldLinesLabel();
                }
            }.bind(this), Cesium.ScreenSpaceEventType.LEFT_CLICK);
        }, // END of createMap

        onShow: function () {
            if (!this.map) {
                this.createMap();
            }

            // Check for possible already available selection
            if (localStorage.getItem('areaSelection') !== null) {
                var bbox = JSON.parse(localStorage.getItem('areaSelection'));
                if (bbox) {
                    this.bboxsel = [bbox.s, bbox.w, bbox.n, bbox.e];
                }
            }

            if (this.navigationhelp) {
                this.navigationhelp.destroy();
                this.navigationhelp = new Cesium.NavigationHelpButton({
                    container: $('.cesium-viewer-toolbar')[0]
                });
            }
            this.isClosed = false;

            $('#cesium_save').on('click', this.onSaveImage.bind(this));

            function synchronizeLayer(l) {
                if (l._cesiumLayer) {
                    if (l._cesiumLayer.show !== l.get('visible')) {
                        var isBaseLayer = defaultFor(l.get('view').isBaseLayer, false);
                        this.changeLayer({
                            name: l.get('name'), visible: l.get('visible'),
                            isBaseLayer: isBaseLayer
                        });
                    }
                }
            }

            // Go through config to make any changes done while widget
            // not active (not in view)
            globals.baseLayers.each(synchronizeLayer, this);
            globals.products.each(synchronizeLayer, this);
            globals.overlays.each(synchronizeLayer, this);

            this.updateLegend();

            //this.connectDataEvents(); // Registers the same event handlers multiple times!

            // Redraw to make sure we are at current selection
            this.createDataFeatures(globals.swarm.get('data'));
            this.updateRelatedDataFeatures();

            $('#bb_selection').unbind('click');
            $('#bb_selection').click(function () {
                if ($('#bb_selection').text() === 'Select Area') {
                    $('#bb_selection').html('Deactivate');
                    $('.bboxEdit').removeClass('hidden');
                    $('#bboxWestForm')[0].focus();
                    $('#bboxWestForm')[0].select();
                    Communicator.mediator.trigger('selection:activated', {
                        id: 'bboxSelection',
                        active: true,
                        selectionType: 'single'
                    });
                } else if ($('#bb_selection').text() === 'Deactivate') {
                    $('#bb_selection').html('Select Area');
                    $('.bboxEdit').addClass('hidden');
                    Communicator.mediator.trigger('selection:activated', {
                        id: 'bboxSelection',
                        active: false,
                        selectionType: 'single'
                    });
                } else if ($('#bb_selection').text() === 'Clear Selection') {
                    $('#bb_selection').html('Select Area');
                    $('.bboxEdit').addClass('hidden');
                    //clear selection to enable new draw save
                    delete this.bboxEdit;
                    Communicator.mediator.trigger('selection:changed', null);
                }
            }.bind(this));
            return this;
        }, // END of onShow

        fillBboxForms: function () {
            // fill bbox forms from localstorage data
            if (localStorage.getItem('areaSelection') !== "null" && localStorage.getItem('areaSelection') !== null) {
                var bbox = JSON.parse(localStorage.getItem('areaSelection'));
                $("#bboxWestForm").val(parseFloat(bbox.w).toFixed(4));
                $("#bboxEastForm").val(parseFloat(bbox.e).toFixed(4));
                $("#bboxNorthForm").val(parseFloat(bbox.n).toFixed(4));
                $("#bboxSouthForm").val(parseFloat(bbox.s).toFixed(4));
            }
        },

        fillBboxFormsWhileDrawing: function (bbox) {
            // fill bbox forms with given bbox and fix it if necessary
            var bboxFixed = this.wrapBbox(bbox);
            $("#bboxWestForm").val(bboxFixed.w.toFixed(4));
            $("#bboxEastForm").val(bboxFixed.e.toFixed(4));
            $("#bboxNorthForm").val(bboxFixed.n.toFixed(4));
            $("#bboxSouthForm").val(bboxFixed.s.toFixed(4));
        },

        connectDataEvents: function () {
            globals.swarm.on('change:data', function (model, data) {
                this.updateLegend();
                this.createDataFeatures(data);
            }, this);

            globals.swarm.get('relatedData').on('change', function (model) {
                this.updateHeightIndices();
                _.each(model.changed, function (data, productType) {
                    if (!data) {
                        this.removeRelatedDataFeatures(productType);
                    } else {
                        this.createRelatedDataFeatures(productType, data);
                    }
                }, this);
            }, this);

            globals.swarm.on('change:filters', function (model, filters) {
                this.createDataFeatures(globals.swarm.get('data'));
                this.updateRelatedDataFeatures();
            }, this);
        },

        onResize: function () {
            this.bindPolarButtons();
            if (this.map._sceneModePicker) {
                var container = this.map._sceneModePicker.container;
                var scene = this.map._sceneModePicker.viewModel._scene;

                // Delete previous scenemodepicker
                delete this.map._sceneModePicker;
                $('.cesium-sceneModePicker-wrapper.cesium-toolbar-button').remove();
                var modepicker = new Cesium.SceneModePicker(container, scene);
                this.map._sceneModePicker = modepicker;
            }
        },

        //method to create layer depending on protocol
        //setting possible description attributes

        createLayer: function (layerdesc) {
            var view = this.getView(layerdesc);

            // Manage custom attribution element (add attribution for active layers)
            if (layerdesc.get('visible')) {
                this.addCustomAttribution(view);
            }

            switch (view.protocol) {
                case 'WMTS':
                    return this.createWMTSLayer(layerdesc, view);
                case 'WMS':
                    return this.createWMSLayer(layerdesc, view);
                case 'WPS':
                    return this.createWPSLayer();
                default: // No supported view available
                    return false;
            }
        },

        getView: function (layerdesc) {
            var views = layerdesc.get('views');
            var view = layerdesc.get('view');

            if (!views && view) {return view;}
            if (views.length === 1) {return views[0];}

            // FIXXME: this whole logic has to be replaced by a more robust method, i.e. a viewer
            // defines, which protocols to support and get's the corresponding views from the
            // config then.

            // When both available WMTS preferred over WMS.
            view = _.find(views, function (view) {
                return view.protocol === 'WMTS';
            });
            if (view) {return view;}

            view = _.find(views, function (view) {
                return view.protocol === 'WMS';
            });
            if (view) {return view;}

            // No supported protocol defined in config.json!
            return null;
        },

        createWMTSLayer: function (layerdesc, view) {
            var options = {
                url: view.urls[0],
                layer: view.id,
                style: view.style,
                format: view.format,
                tileMatrixSetID: view.matrixSet,
                maximumLevel: 13,
                tilingScheme: new Cesium.GeographicTilingScheme({
                    numberOfLevelZeroTilesX: 2, numberOfLevelZeroTilesY: 1
                }),
                credit: new Cesium.Credit(view.attribution),
                show: layerdesc.get('visible')
            };
            if (view.hasOwnProperty('urlTemplate') && view.hasOwnProperty('subdomains')) {
                options.url = view.urlTemplate;
                options.subdomains = view.subdomains;
            }
            return new Cesium.WebMapTileServiceImageryProvider(options);
        },

        createWMSLayer: function (layerdesc, view) {
            var params = $.extend({
                transparent: 'true',
            }, Cesium.WebMapServiceImageryProvider.DefaultParameters);

            // Check if layer has additional parameters configured
            var addParams = {transparent: true};
            var styles;
            if (layerdesc.get('parameters')) {
                _.each(layerdesc.get('parameters'), function (options, key) {
                    if (options.selected) {
                        addParams.dim_bands = key;
                        addParams.dim_range = [
                            options.range[0], options.range[1]
                        ].join(',');
                        styles = options.colorscale;
                    }
                });
            }
            addParams.styles = styles;
            if (layerdesc.get('timeSlider')) {
                addParams.time = [
                    getISODateTimeString(this.beginTime),
                    getISODateTimeString(this.endTime)
                ].join('/');
            }
            if (layerdesc.get('height')) {
                addParams.elevation = layerdesc.get('height');
            }
            if (layerdesc.get('model')) {
                addParams.models = layerdesc.getModelExpression(view.id);
            }
            params.format = layerdesc.get('views')[0].format;
            var layer = new Cesium.WebMapServiceImageryProvider({
                url: view.urls[0],
                layers: view.id,
                tileWidth: layerdesc.get('tileSize'),
                tileHeight: layerdesc.get('tileSize'),
                enablePickFeatures: false,
                parameters: params
            });

            for (var par in addParams) {
                layer.updateProperties(par, addParams[par]);
            }

            return layer;
        },

        createWPSLayer: function () {
            return new Cesium.SingleTileImageryProvider({
                url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
            });
        },

        centerMap: function (data) {
            //this.map.setCenter(new OpenLayers.LonLat(data.x, data.y), data.l);
            this.model.set({
                'center': [data.x, data.y],
                'zoom': data.l
            });
        },

        onSortProducts: function (shifts) {
            // Search for moved layer
            // Sorting only works on model layers so we filter them out first
            globals.products.each(function (product) {
                var cesLayer = product._cesiumLayer;
                if (cesLayer && shifts.hasOwnProperty(product.get('name'))) {
                    // Raise or Lower the layer depending on movement
                    var toMove = shifts[product.get('name')];
                    for (var i = 0; i < Math.abs(toMove); ++i) {
                        if (toMove < 0) {
                            this.map.scene.imageryLayers.lower(cesLayer);
                        } else if (toMove > 0) {
                            this.map.scene.imageryLayers.raise(cesLayer);
                        }
                    }
                }
            }, this);
            console.log('Map products sorted');
        },

        onModelsUpdate: function () {
            this.updateLegend();
        },

        onUpdateOpacity: function (options) {

            var setLayerAlpha = function (layer, alpha) {
                if (layer.show) {
                    layer.alpha = alpha;
                }
            };

            var setFeatureCollectionAlpha = function (collection, alpha) {

                var _setAlpha = function (obj, alpha) {
                    var color = obj.color.clone();
                    color.alpha = alpha;
                    obj.color = color;
                };

                var _setGAttrAlpha = function (attributes, alpha) {
                    var color = attributes.color;
                    attributes.color = Cesium.ColorGeometryInstanceAttribute.toValue(
                        Cesium.Color.fromBytes(
                            color[0], color[1], color[2], Math.floor(alpha * 255)
                        )
                    );
                };

                if (has(collection, 'geometryInstances')) {
                    for (var i = collection._instanceIds.length - 1; i >= 0; i--) {
                        _setGAttrAlpha(collection.getGeometryInstanceAttributes(collection._instanceIds[i]), alpha);
                    }
                } else if (collection.length > 0 && collection.get(0).color) {
                    for (var i = collection.length - 1; i >= 0; i--) {
                        _setAlpha(collection.get(i), alpha);
                    }
                } else if (collection.length > 0 && collection.get(0).appearance) {
                    for (var i = collection.length - 1; i >= 0; i--) {
                        _setAlpha(collection.get(i).appearance.material.uniforms, alpha);
                    }
                }
            };

            var alpha = options.value;
            var product = options.model;
            var identifier = product.get('download').id;
            var satellite = globals.swarm.collection2satellite[identifier];

            if (satellite) {
                var parameters = product.get('parameters');
                var variable = this.getSelectedVariable(parameters);
                _.each(
                    get(parameters[variable], 'referencedParameters', [variable]),
                    function (variable) {
                        var featureId = satellite + variable;
                        var featureCollection = this.featureCollections.get(featureId);
                        if (featureCollection) {
                            setFeatureCollectionAlpha(featureCollection, alpha);
                        }
                    },
                    this
                );
            } else if (product.get('model')) {
                setLayerAlpha(product._cesiumLayer, alpha);
                setLayerAlpha(product._cesiumLayerCustom, alpha);
            }
        },

        addCustomAttribution: function (view) {
            if (view.hasOwnProperty('attribution')) {
                $('#cesium_custom_attribution').append(
                    '<div id="' + view.id.replace(/[^A-Z0-9]/ig, '_') +
                    '" style="float: left; margin-left: 3px;">' +
                    view.attribution + '</div>'
                );
            }
        },

        removeCustomAttribution: function (view) {
            $('#' + view.id.replace(/[^A-Z0-9]/ig, '_')).remove();
        },

        changeLayer: function (options) {
            // Seems for some reason that a layer needs to be as shown at all times
            // or cesium will throw an error, so first activate the new layer, then
            // deactivate the others
            if (options.isBaseLayer) {
                globals.baseLayers.each(function (baselayer) {
                    var cesLayer = baselayer._cesiumLayer;
                    if (cesLayer) {
                        if (baselayer.get('name') === options.name) {
                            cesLayer.show = true;
                            this.addCustomAttribution(baselayer.get('views')[0]);
                        }
                    }
                }, this);

                globals.baseLayers.each(function (baselayer) {
                    var cesLayer = baselayer._cesiumLayer;
                    if (cesLayer) {
                        if (baselayer.get('name') !== options.name) {
                            cesLayer.show = false;
                            this.removeCustomAttribution(baselayer.get('views')[0]);
                        }
                    }
                }, this);

            } else {
                globals.overlays.each(function (overlay) {
                    if (overlay.get('name') === options.name) {
                        var cesLayer = overlay._cesiumLayer;
                        cesLayer.show = options.visible;
                        if (options.visible) {
                            this.addCustomAttribution(overlay.get('view'));
                        } else {
                            this.removeCustomAttribution(overlay.get('view'));
                        }
                    }
                }, this);

                globals.products.each(function (product) {
                    if (product.get('name') === options.name) {
                        product.set('visible', options.visible);

                        if (product.get('model') && this.isCustomModelSelected(product)) {
                            // When custom SHC selected switch to WPS visualization.
                            this.updateCustomModel(product);
                        } else if (product.get('views')[0].protocol === 'WMS' ||
                                  product.get('views')[0].protocol === 'WMTS') {
                            var cesLayer;
                            var parameters = product.get('parameters');
                            if (parameters) {
                                var band = this.getSelectedVariable(parameters);
                                var style = parameters[band].colorscale;
                                var range = parameters[band].range;

                                if (band === 'Fieldlines') {
                                    this.updateActiveFL(product);
                                    this.updateFieldLines();
                                } else {

                                    cesLayer = product._cesiumLayer;
                                    if (band) {
                                        cesLayer.imageryProvider.updateProperties(
                                            'dim_bands', band
                                        );
                                    }
                                    if (range) {
                                        cesLayer.imageryProvider.updateProperties(
                                            'dim_range', (range[0] + ',' + range[1])
                                        );
                                    }
                                    if (style) {
                                        cesLayer.imageryProvider.updateProperties(
                                            'styles', style
                                        );
                                    }
                                    if (product.get('model')) {
                                        cesLayer.imageryProvider.updateProperties(
                                            'models', product.getModelExpression(product.get('download').id)
                                        );
                                    }
                                    cesLayer.show = options.visible;
                                }

                            } else {
                                cesLayer = product._cesiumLayer;
                                cesLayer.show = options.visible;
                            }
                        } // END of WMS and WMTS case
                    }

                    if (product.get('model') && product.get('name') === options.name) {
                        if (this.activeModels.indexOf(product.get('name')) !== -1) {
                            this.activeModels.splice(
                                this.activeModels.indexOf(product.get('name')), 1
                            );
                        }

                    }
                }, this); // END of global products loop
            }

            this.updateLegend();
        }, // END of changeLayer

        isCustomModelSelected: function (product) {
            return Boolean(product.getCustomShcIfSelected());
        },

        showCustomModel: function (product) {
            var parameters = product.get('parameters');
            var band = this.getSelectedVariable(parameters);

            product._cesiumLayer.show = false; // hide WMS layer

            if (band === 'Fieldlines') {
                this.hideCustomModel(product);
                product._cesiumLayerCustom.show = false; // hide WPS layer
                this.updateFieldLines();
                return;
            }

            var style = parameters[band].colorscale;
            var range = parameters[band].range;

            var options = {
                model_expression: product.getModelExpression(),
                shc: product.getCustomShcIfSelected(),
                variable: band,
                begin_time: getISODateTimeString(this.beginTime),
                end_time: getISODateTimeString(this.endTime),
                elevation: product.get('height'),
                height: 512,
                width: 1024,
                style: style,
                range_min: range[0],
                range_max: range[1],
            };

            if (this.bboxsel !== null) {
                var boundingBox = this.bboxsel;
                options.bbox = boundingBox.join();
            }

            $.post(product.get('views')[0].urls[0], tmplEvalModel(options))
                .done(_.bind(function (data) {
                    var customModelLayer = product._cesiumLayerCustom;
                    customModelLayer.show = false;

                    var layers = this.map.scene.imageryLayers;
                    var index = layers.indexOf(customModelLayer);

                    if (index > 0) {
                        var imageURI = 'data:image/gif;base64,' + data;
                        var layerOptions = {url: imageURI};
                        if (boundingBox && boundingBox.length === 4) {
                            var rec = new Cesium.Rectangle(
                                Cesium.Math.toRadians(boundingBox[1]),
                                Cesium.Math.toRadians(boundingBox[0]),
                                Cesium.Math.toRadians(boundingBox[3]),
                                Cesium.Math.toRadians(boundingBox[2])
                            );
                            layerOptions.rectangle = rec;
                        }
                        layers.remove(customModelLayer);
                        customModelLayer = layers.addImageryProvider(
                            new Cesium.SingleTileImageryProvider(layerOptions), index
                        );
                        customModelLayer.alpha = product.get('opacity');
                        customModelLayer.show = true;
                        product._cesiumLayerCustom = customModelLayer;
                    }
                }, this));
            return true;
        },

        hideCustomModel: function (product) {
            product._cesiumLayerCustom.show = false; // hide WPS layer
            return false;
        },

        updateCustomModel: function (product) {
            if (product.get('visible')) {
                return this.showCustomModel(product);
            } else {
                return this.hideCustomModel(product);
            }
        },

        updateRelatedDataFeatures: function () {
            var relatedData = globals.swarm.get('relatedData').attributes;
            _.each(
                _.difference(this.relatedFeatureCollections.list(), _.keys(relatedData)),
                this.removeRelatedDataFeatures, this
            );
            _.each(relatedData, function (data, productType) {
                this.createRelatedDataFeatures(productType, data);
            }, this);
        },

        removeRelatedDataFeatures: function (productType) {
            this.relatedFeatureCollections.remove(productType);
            this.dataLegends.removeProductTypeItems(productType);
        },

        updateHeightIndices: function () {

            // Products of the same level are considered to overlap
            // and therefore the need different heigh index to when displayed
            // simultaneously.
            // Fixed height products are always displayed on their true
            // location (index = 0).

            var products = globals.products.filter(function (product) {
                var collection = product.get('views')[0].id;
                var spacecraft = get(globals.swarm.collection2satellite, collection);
                return (product.get('visible') && spacecraft);
            });

            // initialize index counters
            var index = {};
            _.each(products, function (product) {
                var name = product.get('name');
                var collection = product.get('views')[0].id;
                var spacecraft = get(globals.swarm.collection2satellite, collection);
                var level = get(NOMINAL_PRODUCT_LEVEL, name, DEFAULT_NOMINAL_PRODUCT_LEVEL);
                var fixedHeight = FIXED_HEIGHT_PRODUCT.includes(name);

                setDefault(index, spacecraft, {});
                setDefault(index[spacecraft], level, 0);

                if (fixedHeight) {
                    // set index offset to reserve space for fixed height product
                    index[spacecraft][level] = 1;
                }
            });

            // assign height indices
            _.each(products, function (product) {
                var name = product.get('name');
                var collection = product.get('views')[0].id;
                var spacecraft = get(globals.swarm.collection2satellite, collection);
                var level = get(NOMINAL_PRODUCT_LEVEL, name, DEFAULT_NOMINAL_PRODUCT_LEVEL);
                var fixedHeight = FIXED_HEIGHT_PRODUCT.includes(name);

                product.set('index', fixedHeight ? 0 : index[spacecraft][level]++);
            });
        },

        createRelatedDataFeatures: function (productType, data, timestamp) {

            setDefault(this, '_relatedDataFeaturesTimestamps', {});

            if (timestamp == null) {
                // first run - set the timestamp
                timestamp = Date.now();
                this._relatedDataFeaturesTimestamps[productType] = timestamp;
            } else if (timestamp < get(this._relatedDataFeaturesTimestamps, productType)) {
                // newer data exist - rendering is dropped
                return;
            }

            if (SYMBOLS.loaded()) {
                // proceed with the rendering
                this._createRelatedDataFeatures(productType, data);
                return;
            }

            console.log('symbols not loeaded yet - ' + productType + ' rendering delayed');

            // delay rendering if the symbols have not been loaded yet
            setTimeout(_.bind(function () {
                this.createRelatedDataFeatures(productType, data, timestamp);
            }, this), 100);
        },

        _createRelatedDataFeatures: function (productType, data) {

            var getPointPrimitive = function (symbol, position) {
                return {
                    image: SYMBOLS.get(symbol),
                    position: position,
                    pixelOffset: new Cesium.Cartesian2(0, 0),
                    eyeOffset: new Cesium.Cartesian3(0, 0, -50000),
                    radius: 0,
                    scale: 0.4,
                    scaleByDistance: NEAR_FAR_SCALAR,
                };
            };

            var getGeodeticPointRenderer = function (symbol, altitude) {
                return function (record) {
                    var position = Cesium.Cartesian3.fromDegrees(
                        record.Longitude, record.Latitude, altitude
                    );
                    featureCollection.add(getPointPrimitive(symbol, position));
                };
            };

            var getGeocetricPointRenderer = function (symbol, radius, indices) {
                return function (record) {
                    var position = Cesium.Cartesian3.clone(
                        convertSpherical2Cartesian(
                            record.Latitude, record.Longitude,
                            get(record, 'Radius', radius) +
                            get(indices, record.id, 0) * HEIGHT_OFFSET
                        )
                    );
                    featureCollection.add(getPointPrimitive(symbol, position));
                };
            };

            var getPeakAndBoundaryReneder = function (peakSymbol, boundarySymbol, radius, indices) {
                var renderBoundary = getGeocetricPointRenderer(boundarySymbol, radius, indices);
                var renderPeak = getGeocetricPointRenderer(peakSymbol, radius, indices);
                return function (record) {
                    switch (record.PointType & PT_POINT_TYPE_MASK) {
                        case PT_PEAK:
                            renderPeak(record);
                            break;
                        case PT_BOUNDARY:
                            renderBoundary(record);
                            break;
                    }
                };
            };

            var retrieveHeightIndices = function (parentCollections) {
                var indices = {};
                _.each(parentCollections, function (collectionId, sattelite) {
                    var product = globals.products.get(
                        globals.swarm.collection2product[collectionId]
                    );
                    indices[sattelite] = product.get('index') || 0;
                });
                return indices;
            };

            // -----------------------------------------------------------------

            var timer = new Timer();

            this.relatedFeatureCollections.remove(productType);

            if (!data || data.isEmpty()) {
                this.dataLegends.removeProductTypeItems(productType);
                return;
            }

            var indices = retrieveHeightIndices(data.parentCollections);

            var renderer;
            switch (productType) {
                case 'AEJ_PBS':
                case 'AEJ_PBL':
                    var altitude = {
                        'AEJ_PBL': SWARM_ALTITUDE,
                        'AEJ_PBS': IONOSPHERIC_ALTITUDE,
                    };
                    renderer = getPeakAndBoundaryReneder(
                        'TRIANGLE', 'SQUARE',
                        EARTH_RADIUS + altitude[productType], indices
                    );
                    this.dataLegends.addProductTypeItem(productType, 'EJB', {
                        symbol: 'SQUARE',
                        title: "Electrojet boundary",
                    });
                    this.dataLegends.addProductTypeItem(productType, 'EJP', {
                        symbol: 'TRIANGLE',
                        title: "Peak electrojet current",
                    });
                    break;
                case 'AEJ_PBS:GroundMagneticDisturbance':
                    renderer = getGeodeticPointRenderer('CIRCLE', 0);
                    this.dataLegends.addProductTypeItem(productType, 'MDP', {
                        symbol: 'CIRCLE',
                        title: "Peak magnetic disturbance",
                    });
                    break;
                case 'AOB_FAC':
                    renderer = getGeocetricPointRenderer(
                        'LARGE_DIMOND', EARTH_RADIUS + SWARM_ALTITUDE, indices
                    );
                    this.dataLegends.addProductTypeItem(productType, 'AOB', {
                        symbol: 'DIMOND',
                        title: "Aurora oval boundary",
                    });
                    break;
                default:
                    this.dataLegends.removeProductTypeItems(productType);
                    return;
            }

            var featureCollection = new Cesium.BillboardCollection();
            this.relatedFeatureCollections.add(productType, featureCollection);
            data.forEachRecord(renderer, new RecordFilter(_.keys(data.data)));
            this.relatedFeatureCollections.show(productType);
            this.dataLegends.refresh();

            timer.logEllapsedTime("createRelatedDataFeatures(" + productType + ")");
        },

        createDataFeatures: function (data) {

            var _createPointCollection = _.bind(function (collectionName) {
                var featureCollection = new Cesium.PointPrimitiveCollection();
                if (!this.map.scene.context._gl.getExtension('EXT_frag_depth')) {
                    featureCollection._rs =
                        Cesium.RenderState.fromCache({
                            depthTest: {
                                enabled: true,
                                func: Cesium.DepthFunction.LESS
                            },
                            depthMask: false,
                            blending: Cesium.BlendingState.ALPHA_BLEND
                        });
                }
                this.featureCollections.add(collectionName, featureCollection);
                return featureCollection;
            }, this);

            var _createPolylineCollection = _.bind(function (collectionName) {
                var featureCollection = new Cesium.Primitive({
                    geometryInstances: [],
                    appearance: new Cesium.PolylineColorAppearance({
                        translucent: true
                    }),
                    releaseGeometryInstances: false
                });
                this.featureCollections.add(collectionName, featureCollection);
                return featureCollection;
            }, this);

            // factory function returning a parameter-specific feature-creating function
            var getPointFeatureCreator = function (parameter) {

                var _createPoint = function (record, settings) {
                    var value = record[parameter];
                    if (isNaN(value)) {return;}

                    var radius = record.Radius;
                    if (settings.fixedAltitude || radius == null) {
                        radius = get(NOMINAL_RADIUS, parameter, DEFAULT_NOMINAL_RADIUS);
                    }
                    var position = convertSpherical2Cartesian(
                        record.Latitude,
                        record.Longitude,
                        radius + get(settings, 'index', 0) * HEIGHT_OFFSET
                    );
                    var color = settings.colormap.getColor(value);
                    var feature = {
                        position: new Cesium.Cartesian3.clone(position),
                        color: new Cesium.Color.fromBytes(
                            color[0], color[1], color[2], settings.alpha
                        ),
                        pixelSize: get(settings, 'pixelSize', DEFAULT_POINT_PIXEL_SIZE),
                        scaleByDistance: NEAR_FAR_SCALAR,
                    };
                    if (settings.outlines) {
                        feature.outlineWidth = 0.5;
                        feature.outlineColor = Cesium.Color.fromCssColorString(
                            settings.outline_color
                        );
                    }
                    settings.featureCollection.add(feature);
                };

                switch (parameter) {
                    case 'Bubble_Probability':
                        return function (row, settings, index) {
                            if (row[parameter] > BUBLE_PROBABILITY_THRESHOLD) {
                                _createPoint(row, settings, index);
                            }
                        };
                    default:
                        return _createPoint;
                }
            };

            // factory function returning a parameter-specific feature-creating function
            var getVectorFeatureCreator = function (parameter) {

                var lineCounter = 0;

                var __createVector = function (x, y, z, dx, dy, dz, color, settings) {
                    settings.featureCollection.geometryInstances.push(
                        new Cesium.GeometryInstance({
                            geometry: new Cesium.PolylineGeometry({
                                positions: [
                                    new Cesium.Cartesian3(x, y, z),
                                    new Cesium.Cartesian3(x + dx, y + dy, z + dz),
                                ],
                                followSurface: false,
                                width: 1.7,
                                vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT
                            }),
                            id: 'vec_line_' + lineCounter++,
                            attributes: {
                                color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                                    new Cesium.Color.fromBytes(
                                        color[0], color[1], color[2], settings.alpha
                                    )
                                )
                            }
                        })
                    );
                };

                // TEC GPS-pointing vectors
                var _createVectorTEC = function (record, settings) {
                    var value = record[parameter];
                    if (isNaN(value)) {return;}

                    var x = record.LEO_Position_X;
                    var y = record.LEO_Position_Y;
                    var z = record.LEO_Position_Z;

                    var dx = record.GPS_Position_X - x;
                    var dy = record.GPS_Position_Y - y;
                    var dz = record.GPS_Position_Z - z;

                    var scale = TEC_VECTOR_LENGTH / vnorm3(dx, dy, dz);

                    __createVector(
                        x, y, z, scale * dx, scale * dy, scale * dz,
                        settings.colormap.getColor(value), settings
                    );
                };

                // vectors in NEC frame
                var _createVectorNEC = function (record, settings) {
                    var value = settings.norms[record.__index__];
                    if (isNaN(value)) {return;}

                    var scale = MAX_VECTOR_LENGTH / settings.maxNorm;

                    var position = convertSpherical2Cartesian(
                        record.Latitude,
                        record.Longitude,
                        record.Radius + get(settings, 'index', 0) * HEIGHT_OFFSET
                    );

                    var components = settings.components;
                    var vector = rotateHorizontal2Cartesian(
                        record.Latitude,
                        record.Longitude,
                        +scale * record[components[0]],
                        +scale * record[components[1]],
                        -scale * record[components[2]]
                    );

                    __createVector(
                        position.x, position.y, position.z,
                        vector.x, vector.y, vector.z,
                        settings.colormap.getColor(value), settings
                    );
                };

                // sheet currents in horizontal NE frame
                var _createVectorJNE = function (record, settings) {
                    var value = get(record, parameter) || settings.norms[record.__index__];
                    if (isNaN(value)) {return;}

                    var scale = MAX_VECTOR_LENGTH / settings.maxNorm;

                    var position = convertSpherical2Cartesian(
                        record.Latitude,
                        record.Longitude,
                        get(NOMINAL_RADIUS, parameter, DEFAULT_NOMINAL_RADIUS) + get(settings, 'index', 0) * HEIGHT_OFFSET
                    );

                    var components = settings.components;
                    var vector = rotateHorizontal2Cartesian(
                        record.Latitude,
                        record.Longitude,
                        scale * record[components[0]],
                        scale * record[components[1]],
                        0.0
                    );

                    __createVector(
                        position.x, position.y, position.z,
                        vector.x, vector.y, vector.z,
                        settings.colormap.getColor(value), settings
                    );
                };

                switch (parameter) {
                    case 'Absolute_STEC':
                    case 'Absolute_VTEC':
                    case 'Elevation_Angle':
                    case 'Relative_STEC':
                    case 'Relative_STEC_RMS':
                        var sampler = new Subsampler(TEC_VECTOR_SAMPLING);
                        return function (row, settings, index) {
                            if (sampler.testSample(row[TIMESTAMP].getTime())) {
                                _createVectorTEC(row, settings, index);
                            }
                        };

                    case 'J_QD':
                    case 'J_DF_SemiQD':
                    case 'J_CF_SemiQD':
                    case 'J_NE':
                    case 'J_T_NE':
                    case 'J_DF_NE':
                    case 'J_CF_NE':
                        var sampler = new Subsampler(JNE_VECTOR_SAMPLING);
                        return function (row, settings, index) {
                            if (sampler.testSample(row[TIMESTAMP].getTime())) {
                                _createVectorJNE(row, settings, index);
                            }
                        };
                    default:
                        var sampler = new Subsampler(NEC_VECTOR_SAMPLING);
                        return function (row, settings, index) {
                            if (sampler.testSample(row[TIMESTAMP].getTime())) {
                                _createVectorNEC(row, settings, index);
                            }
                        };
                }
            };

            var getSettings = function () {
                // collect visible parameters and their settings

                var settings = {};

                globals.products.each(function (product) {
                    if (!product.get('visible')) {return;}
                    var collection = product.get('views')[0].id;
                    var spacecraft = get(globals.swarm.collection2satellite, collection);
                    if (!spacecraft) {return;}

                    setDefault(settings, spacecraft, {});

                    var _addParameterToSettings = function (name, options) {
                        options = settings[spacecraft][name] = _.extend(
                            {},
                            product.get('parameters')[name],
                            {
                                name: name,
                                collection: collection,
                                outlines: product.get('outlines'),
                                outline_color: product.get('color'),
                                alpha: Math.floor(product.get('opacity') * 255),
                                index: product.get('index') || 0,
                            },
                            options || {}
                        );
                        options.colormap = new colormap.ColorMap(
                            options.colorscale, options.range
                        );
                        return options;
                    };

                    _.each(product.get('parameters'), function (parameterSettings, parameterName) {
                        if (!parameterSettings.selected) {return;}
                        if (has(parameterSettings, 'referencedParameters')) {
                            _.each(parameterSettings.referencedParameters, _addParameterToSettings);
                        } else {
                            _addParameterToSettings(parameterName);
                        }
                    });
                }, this);

                if (_.isEmpty(settings)) {
                    return settings;
                }

                // initialize Cesium feature collection and collect additional attributes
                var _vectorNormsCache = new CachedVectorNorms();

                _.uniq(data.data.id).forEach(function (id) {
                    var _parameterIsMissing = function (key) {
                        return !_.has(data.data, key);
                    };

                    var _settingsHaveParameter = function (key) {
                        return _.has(settings[id], key);
                    };

                    var _addPointCollection = function (parameter) {
                        if (_parameterIsMissing(parameter)) {return;}
                        var _settings = settings[id][parameter];
                        _.extend(_settings, {
                            isScalar: true,
                            featureCollection: _createPointCollection(id + parameter),
                            featureCreator: getPointFeatureCreator(parameter),
                        });
                    };

                    var _addVectorCollection = function (parameter, components) {
                        if (!components) {
                            if (_parameterIsMissing(parameter)) {return;}
                        } else {
                            if (_.any(components, _parameterIsMissing)) {return;}
                        }
                        var _settings = settings[id][parameter];
                        _.extend(_settings, {
                            isVector: true,
                            featureCollection: _createPolylineCollection(id + parameter),
                            featureCreator: getVectorFeatureCreator(parameter),
                        });
                        if (components) {
                            _settings.components = components;
                            _.extend(_settings, _vectorNormsCache.getVectorNorms(
                                parameter, _.values(_.pick(data.data, components))
                            ));
                        }
                    };

                    _.filter(SCALAR_PARAM, _settingsHaveParameter).map(function (parameter) {
                        var relatedVector = get(settings[id][parameter], 'relatedVector');
                        if (relatedVector && !_parameterIsMissing(parameter)) {
                            _addVectorCollection(parameter, get(data.vectors, relatedVector));
                        } else {
                            _addPointCollection(parameter);
                        }
                    });

                    _.filter(VECTOR_PARAM, _settingsHaveParameter).map(function (parameter) {
                        _addVectorCollection(parameter, get(data.vectors, parameter));
                    });
                });

                return settings;
            };

            // -----------------------------------------------------------------

            var timer = new Timer();

            // The feature collections are removed directly when a change happens
            // because of the asynchronous behaviour it can happen that a collection
            // is added between removing it and adding another one so here we make sure
            // it is empty before overwriting it, which would lead to a not referenced
            // collection which is no longer deleted.
            // I remove it before the response because a direct feedback to the user is important
            // There is probably a cleaner way to do this
            this.featureCollections.removeAll();

            if (data.isEmpty()) {return;}

            this.updateHeightIndices();

            var settings = getSettings();
            if (_.isEmpty(settings)) {return;}

            data.forEachRecord(
                function (record) {
                    _.each(settings[record.id], function (parameterSettings) {
                        parameterSettings.featureCreator(record, parameterSettings);
                    });
                },
                new RecordFilter(_.keys(data.data))
            );

            this.featureCollections.showAll();

            timer.logEllapsedTime("createDataFeatures()");
        },

        onLayerOutlinesChanged: function (collection) {
            this.createDataFeatures(globals.swarm.get('data'));
        },

        onLayerParametersChanged: function (layer, onlyStyleChange) {
            // optional bool argument onlyStyleChange to allow fieldlines re-rendering without fetching new data

            var product = globals.products.find(function (product) {
                return product.get('name') === layer;
            });

            var variable = this.getSelectedVariable(product.get('parameters'));
            if (product === undefined) {
                return;
            } else if (product.get('views')[0].protocol === 'CZML') {
                this.createDataFeatures(globals.swarm.get('data'));
            } else if (product.get('views')[0].protocol === 'WMS') {

                if (variable === 'Fieldlines') {
                    this.hideCustomModel(product);
                    this.hideWMSLayer(product);
                    this.updateActiveFL(product);
                } else {
                    this.deleteActiveFL(product);
                    if (this.isCustomModelSelected(product)) {
                        this.updateCustomModel(product);
                    } else {
                        this.hideCustomModel(product);
                        this.updateWMSLayer(product);
                    }
                }
                this.updateFieldLines(onlyStyleChange);
            }

            this.updateLegend();
        },

        hideWMSLayer: function (product) {
            var cesLayer = product._cesiumLayer;
            cesLayer.show = false;
            this.map.scene.imageryLayers.remove(cesLayer, false);
        },

        updateWMSLayer: function (product) {
            var parameters = product.get('parameters');
            var band = this.getSelectedVariable(parameters);
            var style = parameters[band].colorscale;
            var range = parameters[band].range;
            var height = product.get('height');
            var id = product.get('download').id;

            var cesLayer = product._cesiumLayer;
            cesLayer.imageryProvider.updateProperties('dim_bands', band);
            cesLayer.imageryProvider.updateProperties('dim_range', [range[0], range[1]].join(','));
            cesLayer.imageryProvider.updateProperties('elevation', height);

            cesLayer.imageryProvider.updateProperties(
                'dim_contours', product.get('contours') ? 1 : 0
            );
            if (style) {
                cesLayer.imageryProvider.updateProperties('styles', style);
            }

            if (product.get('model')) {
                cesLayer.imageryProvider.updateProperties(
                    'models', product.getModelExpression(id)
                );
            }

            if (product.get('visible')) {
                cesLayer.show = true;
                var index = this.map.scene.imageryLayers.indexOf(cesLayer);
                this.map.scene.imageryLayers.remove(cesLayer, false);
                this.map.scene.imageryLayers.add(cesLayer, index);
            }
        },

        onAnalyticsFilterChanged: function (filter) {
            console.log(filter);
        },


        onExportGeoJSON: function () {
            var geojsonstring = this.geojson.write(this.vectorLayer.features, true);
            var blob = new Blob([geojsonstring], {
                type: 'text/plain;charset=utf-8'
            });
            saveAs(blob, 'selection.geojson');
        },

        onGetGeoJSON: function () {
            return this.geojson.write(this.vectorLayer.features, true);
        },

        onGetMapExtent: function () {
            return this.getMapExtent();
        },

        getMapExtent: function () {
            var ellipsoid = this.map.scene.globe.ellipsoid;
            var c2 = new Cesium.Cartesian2(0, 0);
            var leftTop = this.map.scene.camera.pickEllipsoid(c2, ellipsoid);
            c2 = new Cesium.Cartesian2(this.map.scene.canvas.width, this.map.scene.canvas.height);
            var rightDown = this.map.scene.camera.pickEllipsoid(c2, ellipsoid);

            if (leftTop != null && rightDown != null) { //ignore jslint
                leftTop = ellipsoid.cartesianToCartographic(leftTop);
                rightDown = ellipsoid.cartesianToCartographic(rightDown);
                return {
                    left: Cesium.Math.toDegrees(leftTop.longitude),
                    bottom: Cesium.Math.toDegrees(rightDown.latitude),
                    right: Cesium.Math.toDegrees(rightDown.longitude),
                    top: Cesium.Math.toDegrees(leftTop.latitude)
                };
            } else {
                //The sky is visible in 3D
                // TODO: Not sure what the best way to calculate the extent is when sky/space is visible.
                //       This method is just an approximation, not actually correct
                // Try to get center point
                var center = new Cesium.Cartesian2(this.map.scene.canvas.width / 2, this.map.scene.canvas.height / 2);
                center = this.map.scene.camera.pickEllipsoid(center, ellipsoid);
                if (center && center !== null) {
                    center = ellipsoid.cartesianToCartographic(center);
                    return {
                        left: Cesium.Math.toDegrees(center.longitude) - 90,
                        bottom: Cesium.Math.toDegrees(center.latitude) - 45,
                        right: Cesium.Math.toDegrees(center.longitude) + 90,
                        top: Cesium.Math.toDegrees(center.latitude) + 45
                    };
                } else {
                    // If everything fails assume whole world is visible which is wrong
                    return {left: -180, bottom: -90, right: 180, top: 90};
                }
            }
        },

        createViewportQuad: function (img, x, y, width, height) {
            var newmat = new Cesium.Material.fromType('Image', {
                image: img,
                color: new Cesium.Color(1, 1, 1, 1),
            });
            return new Cesium.ViewportQuad(
                new Cesium.BoundingRectangle(x, y, width, height), newmat
            );
        },

        updateLegend: function () {
            var timer = new Timer();
            globals.products.each(function (product) {
                this.colorScales.update(product, this.getLegendVariables(product));
            }, this);
            this.colorScales.refresh();
            timer.logEllapsedTime("updateLegend()");
        },

        updateProductLegend: function (product) {
            var timer = new Timer();
            this.colorScales.update(product, this.getLegendVariables(product));
            this.colorScales.refresh();
            timer.logEllapsedTime("updateProducLegend()");
        },

        getLegendVariables: function (product) {
            var parameters = product.get('parameters');
            var selected = [];
            if (parameters) {
                var selectedParameterName = this.getSelectedVariable(parameters);
                if (selectedParameterName) {
                    var selectedParameter = parameters[selectedParameterName];
                    if (this.isColorScaleVisible(product)) {
                        if (has(selectedParameter, 'referencedParameters')) {
                            selected = selectedParameter.referencedParameters;
                        } else {
                            selected = [selectedParameterName];
                        }
                    }
                }
            }
            return _.filter(selected, function (parameter) {
                return this.parameterExists(product, parameter);
            }, this);
        },

        parameterExists: function (product, parameter) {
            // return true if data contain given parameter

            // Magnetic model product is not under any swarm satellite
            // and thus it does not appear in the data.
            if (product.get('model')) {return true;}

            var data = globals.swarm.get('data');
            if (data.isEmpty()) return false;

            var source = get(globals.swarm.collection2satellite, product.get('download').id);
            return (get(data.info.variables, source) || []).includes(parameter);
        },

        isColorScaleVisible: function (product) {
            // return true is the product is visible
            product = product.attributes;
            if (!product.visible) {return false;}
            if (!product.showColorscale) {return false;}
            if (product.timeSliderProtocol === 'INDEX') {return false;}

            if (product.model) {
                //if (product.views[0].protocol === 'WPS' && product.shc === null) {return false;}
                if ((product.components || []).length > 1) {return true;}
            }

            return true;
        },

        renderDataLegend: function (name, options) {
            var width = 250;
            var height = 20;

            var id = 'svg-data-legend-container-' + name;

            $('#' + id).remove();
            var svgContainer = d3.select('body').append('svg')
                .attr('width', width)
                .attr('height', height)
                .attr('id', id);

            svgContainer.append('text')
                .attr('x', 22)
                .attr('y', 14)
                .attr('font-weight', 'bold')
                .text(options.title);

            var svgHtml = d3.select('#' + id)
                .attr('version', 1.1)
                .attr('xmlns', 'http://www.w3.org/2000/svg')
                .node().outerHTML;

            svgContainer.remove();

            var canvas = document.createElement('canvas');
            canvas.height = height;
            canvas.width = width;

            var context = canvas.getContext('2d');
            context.clearRect(0, 0, width, height);
            context.drawSvg(svgHtml, 0, 0, width, height);

            var symbol = SYMBOLS.get(options.symbol);
            context.scale(0.5, 0.5);
            context.drawImage(symbol, 0, 0, symbol.width, symbol.height);

            return {
                dataUrl: canvas.toDataURL('image/png'),
                height: height,
                width: width,
            };
        },

        renderColorScale: function (product, parameterName) {
            var margin = 20;
            var width = 300;
            var height = 55;
            var scaleWidth = width - margin * 2;
            var scaleYOffset = 8;
            var scaleHeight = 10;

            // Render new colorscale images.
            var options = product.get('parameters')[parameterName];
            var rangeMin = options.range[0];
            var rangeMax = options.range[1];
            var uom = options.uom;
            var style = options.colorscale;
            var logscale = get(options, 'logarithmic', false);

            $('#svgcolorscalecontainer').remove();
            var svgContainer = d3.select('body').append('svg')
                .attr('width', 300)
                .attr('height', 60)
                .attr('id', 'svgcolorscalecontainer');

            var axisScale = logscale ? d3.scale.log() : d3.scale.linear();
            axisScale.domain([rangeMin, rangeMax]);
            axisScale.range([0, scaleWidth]);

            var xAxis = d3.svg.axis()
                .scale(axisScale);

            if (logscale) {
                var numberFormat = d3.format(',f');
                xAxis.tickFormat(function logFormat(d) {
                    var x = Math.log10(d) + 1e-6;
                    return Math.abs(x - Math.floor(x)) < 0.3 ? numberFormat(d) : '';
                });

            } else {
                var step = Number(((rangeMax - rangeMin) / 5).toPrecision(3));
                var ticks = d3.range(rangeMin, rangeMax + step, step);
                xAxis.tickValues(ticks);
                xAxis.tickFormat(d3.format('g'));
            }

            var g = svgContainer.append('g')
                .attr('class', 'x axis')
                .attr('transform', 'translate(' + [margin, 20] + ')')
                .call(xAxis);

            // Add layer info
            var info;
            if (product.get('model')) {
                if (product.get('components').length === 1) {
                    info = product.getPrettyModelExpression(true);
                } else {
                    info = product.get('download').id;
                }
                _.each(
                    {'\u2212': /&minus;/, '\u2026': /&hellip;/},
                    function (regex, newString) {
                        info = info.replace(regex, newString);
                    }
                );
            } else {
                info = product.get('name');
            }

            info += ' - ' + parameterName;
            if (uom) {
                info += ' [' + uom + ']';
            }

            g.append('text')
                .style('text-anchor', 'middle')
                .attr('transform', 'translate(' + [scaleWidth / 2, 30] + ')')
                .attr('font-weight', 'bold')
                .text(info);

            svgContainer.selectAll('text')
                .attr('stroke', 'none')
                .attr('fill', 'black')
                .attr('font-weight', 'bold');

            svgContainer.selectAll('.tick').select('line')
                .attr('stroke', 'black');

            svgContainer.selectAll('.axis .domain')
                .attr('stroke-width', '2')
                .attr('stroke', '#000')
                .attr('shape-rendering', 'crispEdges')
                .attr('fill', 'none');

            svgContainer.selectAll('.axis path')
                .attr('stroke-width', '2')
                .attr('shape-rendering', 'crispEdges')
                .attr('stroke', '#000');

            var svgHtml = d3.select('#svgcolorscalecontainer')
                .attr('version', 1.1)
                .attr('xmlns', 'http://www.w3.org/2000/svg')
                .node().innerHTML;

            var canvas = document.createElement('canvas');
            canvas.height = height;
            canvas.width = width;
            var context = canvas.getContext('2d');
            context.clearRect(0, 0, width, height);
            context.drawSvg(svgHtml, 0, 0, height, width);
            svgContainer.remove();

            var csCanvas = (new colormap.ColorMap(style)).getCanvas();
            context.translate(margin, scaleYOffset);
            context.scale(scaleWidth / csCanvas.width, scaleHeight / csCanvas.height);
            context.drawImage(csCanvas, 0, 0);

            var colorscale = {
                dataUrl: canvas.toDataURL('image/png'),
                height: height,
                width: width,
            };

            // model tooltip
            if (product.get('model') && product.get('components').length > 1) {
                colorscale.tooltip = {
                    'element': this.$el,
                    'class': 'colorscaleLabel',
                    'text': product.getPrettyModelExpression(true),
                };
            }

            return colorscale;
        },

        onSelectionActivated: function (arg) {
            this.selectionType = arg.selectionType;
            this.fillBboxForms();
            if (arg.active) {
                this.drawhelper.startDrawingRectangle({
                    callback: function (extent) {
                        var bbox = {
                            n: Cesium.Math.toDegrees(extent.north),
                            e: Cesium.Math.toDegrees(extent.east),
                            s: Cesium.Math.toDegrees(extent.south),
                            w: Cesium.Math.toDegrees(extent.west)
                        };
                        Communicator.mediator.trigger('selection:changed', bbox);
                        this.fillBboxForms();
                        $('.bboxEdit').addClass('hidden');
                    }.bind(this)
                });
            } else {
                //Communicator.mediator.trigger('selection:changed', null);
                this.drawhelper.stopDrawing();
                // It seems the drawhelper muted handlers reset to false and
                // it creates issues in cesium picking for some reason so
                // we deactivate them again
                this.drawhelper._handlersMuted = true;
            }
        },

        onSelectionChanged: function (bbox) {

            // It seems the drawhelper muted handlers reset to false and
            // it creates issues in cesium picking for some reason so
            // we deactivate them again
            this.drawhelper._handlersMuted = true;

            // Remove any possible selection and field lines (e.g.by tutorial)
            if (this.extentPrimitive) {
                this.map.entities.remove(this.extentPrimitive);
            }
            this.hideFieldLines();

            if (bbox) {
                this.bboxsel = [bbox.s, bbox.w, bbox.n, bbox.e];
                var rectangle = Cesium.Rectangle.fromDegrees(bbox.w, bbox.s, bbox.e, bbox.n);
                this.extentPrimitive = this.map.entities.add({
                    id: 'selectionrectangle',
                    rectangle: {
                        coordinates: rectangle,
                        fill: false,
                        outline: true,
                        outlineColor: Cesium.Color.BLUE,
                        outlineWidth: 2
                    }
                });
                this.updateFieldLines();
                $('#bb_selection').html('Clear Selection');

            } else {
                this.bboxsel = null;
                $('#bb_selection').html('Select Area');
            }

            // When custom SHC selected switch to WPS visualization.
            _.each(
                globals.products.filter(function (product) {
                    return product.get('model') && this.isCustomModelSelected(product);
                }, this),
                this.updateCustomModel, this
            );
        },

        updateFieldLines: function (onlyStyleChange) {
            if (typeof this.showFieldLinesDebounced === 'undefined') {
                this.showFieldLinesDebounced = _.debounce(function (onlyStyleChange) {
                    this.showFieldLines(onlyStyleChange);
                }, 2000);
            }
            this.hideFieldLinesLabel();
            if (this.activeFL.length > 0 && this.bboxsel) {
                this.showFieldLinesDebounced(onlyStyleChange);
            } else {
                this.hideFieldLines();
            }
        },

        showFieldLines: function (onlyStyleChange) {
            _.each(
                globals.products.filter(function (product) {
                    return this.activeFL.indexOf(product.get('download').id) !== -1;
                }, this),
                function (product) {
                    var name = product.get('name');
                    var parameters = product.get('parameters');
                    var variable = this.getSelectedVariable(parameters);
                    var style = parameters[variable].colorscale;
                    var range_min = parameters[variable].range[0];
                    var range_max = parameters[variable].range[1];
                    var log_scale = parameters[variable].logarithmic;
                    var time = meanDate(this.beginTime, this.endTime);
                    this.removeFLPrimitives(name);

                    if (variable !== 'Fieldlines') return;

                    if (product.getModelValidity().start > time || product.getModelValidity().end < time) return;
                    var options = {
                        model_ids: product.getModelExpression(product.get('download').id),
                        shc: product.getCustomShcIfSelected(),
                        time: getISODateTimeString(time),
                        bbox: [
                            this.bboxsel[0], this.bboxsel[1], this.bboxsel[2], this.bboxsel[3]
                        ].join(','),
                    };
                    if (onlyStyleChange && typeof this.FLStoredData[name] !== 'undefined') {
                        // do not send request to server if no new data needed
                        this.createFLPrimitives(this.FLStoredData[name], name, style, range_min, range_max, log_scale);
                    } else {
                        // send regular request
                        httpRequest.asyncHttpRequest({
                            context: this,
                            type: 'POST',
                            url: product.get('views')[0].urls[0],
                            data: tmplGetFieldLines(options),
                            responseType: 'arraybuffer',
                            parse: function (data, xhr) {
                                return msgpack.decode(new Uint8Array(data));
                            },
                            success: function (data, xhr) {
                                this.createFLPrimitives(data, name, style, range_min, range_max, log_scale);
                                this.FLStoredData[name] = data;
                            },
                            error: function (xhr) {
                                if (xhr.responseText === "") {return;}
                                var error_text = xhr.responseText.match("<ows:ExceptionText>(.*)</ows:ExceptionText>");
                                if (error_text && error_text.length > 1) {
                                    error_text = error_text[1];
                                } else {
                                    error_text = 'Please contact feedback@vires.services if issue persists.';
                                }
                                showMessage('danger', ('Problem retrieving data: ' + error_text), 35);
                            }
                        });
                    }
                }, this
            );
        },

        hideFieldLines: function () {
            _.each(_.keys(this.FLCollection), this.removeFLPrimitives, this);
            this.hideFieldLinesLabel();
        },

        getSelectedVariable: function (parameters) {
            if (!parameters) return;
            for (var key in parameters) {
                if (parameters[key].selected) {
                    return key;
                }
            }
        },

        updateActiveFL: function (product) {
            if (product.get('visible')) {
                this.insertActiveFL(product);
            } else {
                this.deleteActiveFL(product);
            }
        },

        insertActiveFL: function (product) {
            var id = product.get('download').id;
            var index = this.activeFL.indexOf(id);
            if (index === -1) {
                this.activeFL.push(id);
            }
        },

        deleteActiveFL: function (product) {
            var id = product.get('download').id;
            var index = this.activeFL.indexOf(id);
            if (index !== -1) {
                this.activeFL.splice(index, 1);
            }
        },

        onFieldlinesChanged: function () {
            this.updateFieldLines();
        },

        removeFLPrimitives: function (name) {
            if (this.FLCollection.hasOwnProperty(name)) {
                this.map.scene.primitives.remove(this.FLCollection[name]);
                delete this.FLCollection[name];
                delete this.FLData[name];
            }
        },

        createFLPrimitives: function (data, name, style, range_min, range_max, log_scale) {
            var norm = log_scale ? colormap.LogNorm : colormap.LinearNorm;
            var colorMap = new colormap.ColorMap(style, norm(range_min, range_max));

            this.removeFLPrimitives(name);
            var instances = _.chain(data.fieldlines)
                .map(function (fieldlines, modelId) {
                    return _.map(fieldlines, function (fieldline, index) {
                        // Note that all coordinates are in geocentric spherical CS,
                        // i.e., [latitude, longitude, radius]
                        // The angles are in degrees and lengths in meters.
                        var positions = _.map(fieldline.coordinates, function (coords) {
                            return Cesium.Cartesian3.clone(
                                convertSpherical2Cartesian(coords[0], coords[1], coords[2])
                            );
                        });
                        var colors = _.map(fieldline.values, function (value) {
                            var color = colorMap.getColor(value);
                            return Cesium.Color.fromBytes(color[0], color[1], color[2], 255);
                        });
                        // save data to get fieldline info later
                        if (typeof this.FLData[name] === 'undefined') {
                            this.FLData[name] = {};
                        }
                        var id = 'vec_line_fl_' + modelId + '_' + index;
                        this.FLData[name][id] = {
                            'apex_point': fieldline.apex_point,
                            'apex_height': fieldline.apex_height,
                            'ground_points': fieldline.ground_points,
                        };

                        return new Cesium.GeometryInstance({
                            id: id,
                            geometry: new Cesium.PolylineGeometry({
                                width: 2.0,
                                vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT,
                                colorsPerVertex: true,
                                positions: positions,
                                colors: colors,
                            })
                        });
                    }, this);
                }, this)
                .flatten()
                .value();

            this.FLCollection[name] = new Cesium.Primitive({
                geometryInstances: instances,
                appearance: new Cesium.PolylineColorAppearance()
            });
            this.map.scene.primitives.add(this.FLCollection[name]);
        },

        onFieldlineClicked: function (fieldline, clickPosition) {
            var FLProduct = _.find(Object.keys(this.FLData), function (item) {
                // find product where searched id exists as value
                return this.FLData[item][fieldline.id];
            }.bind(this));
            if (typeof FLProduct !== 'undefined') {
                var fl_data = this.FLData[FLProduct][fieldline.id];
                // prepare template data
                var apex;
                if (fl_data.hasOwnProperty('apex_point') && fl_data.apex_point !== null) {
                    apex = {
                        lat: fl_data['apex_point'][0].toFixed(3),
                        lon: fl_data['apex_point'][1].toFixed(3),
                        height: (fl_data['apex_height'] / 1000).toFixed(1)
                    };
                }

                var ground_points = [{
                    lat: fl_data['ground_points'][0][0].toFixed(3),
                    lon: fl_data['ground_points'][0][1].toFixed(3),
                }];

                if (fl_data.ground_points.length > 1) {
                    ground_points.push({
                        lat: fl_data['ground_points'][1][0].toFixed(3),
                        lon: fl_data['ground_points'][1][1].toFixed(3)
                    });
                }
                var options = {
                    ground_points: ground_points,
                    apex: apex,
                };

                $('#fieldlines_label').html(tmplFieldLinesLabel(options));
                $('#fieldlines_label').removeClass('hidden');
                $('#fieldlines_label').offset({left: clickPosition.x + 18, top: clickPosition.y});
                $('.close-fieldline-label').off('click');
                $('.close-fieldline-label').on('click', this.hideFieldLinesLabel.bind(this));
                // highlight points
                this.FLbillboards.removeAll();
                if (apex) {
                    this.highlightFieldLinesPoints(
                        [].concat(
                            [fl_data['apex_point']],
                            fl_data['ground_points']
                        )
                    );
                } else {
                    this.highlightFieldLinesPoints(
                        fl_data.ground_points
                    );
                }
            }
        },

        hideFieldLinesLabel: function () {
            $('#fieldlines_label').addClass('hidden');
            if (this.FLbillboards) {
                this.FLbillboards.removeAll();
            }
        },

        onHighlightPoint: function (coords, fieldlines_highlight) {
            var wrongInput = !coords || (coords.length === 3 && _.some(coords, function (el) {
                return isNaN(el);
            }));
            if (wrongInput) {
                return null;
            }
            // either highlight single point or point on a fieldline
            if (!fieldlines_highlight) {
                this.billboards.removeAll();
            }
            var canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            var context2D = canvas.getContext('2d');
            context2D.beginPath();
            context2D.arc(16, 16, 12, 0, Cesium.Math.TWO_PI, true);
            context2D.closePath();
            context2D.strokeStyle = 'rgb(255, 255, 255)';
            context2D.lineWidth = 3;
            context2D.stroke();

            context2D.beginPath();
            context2D.arc(16, 16, 9, 0, Cesium.Math.TWO_PI, true);
            context2D.closePath();
            context2D.strokeStyle = 'rgb(0, 0, 0)';
            context2D.lineWidth = 3;
            context2D.stroke();
            var canvasPoint = {
                imageId: 'custom canvas point',
                image: canvas,
                position: Cesium.Cartesian3.fromDegrees(coords[1], coords[0], parseInt(coords[2] - 6384100)),
                radius: coords[2],
                scale: 1
            };
            if (!fieldlines_highlight) {
                this.billboards.add(canvasPoint);
            } else {
                this.FLbillboards.add(canvasPoint);
            }
        },

        highlightFieldLinesPoints: function (fieldlines) {
            // accepts a list of fieldline points to be highlighted
            _.each(fieldlines, function (item) {
                this.onHighlightPoint([item[0], item[1], item[2]], true);
            }.bind(this));
        },

        onRemoveHighlights: function () {
            this.billboards.removeAll();
        },

        onTimeChange: function (time) {
            var string = getISODateTimeString(time.start) + '/' +
                         getISODateTimeString(time.end);
            this.beginTime = time.start;
            this.endTime = time.end;
            globals.products.each(function (product) {

                if (product.get('timeSlider')) {
                    // Check if product contains shc file, if yes we need
                    // to switch to wps for visualization
                    if (product.get('model') && this.isCustomModelSelected(product)) {
                        this.updateCustomModel(product);
                    } else {
                        product.set('time', string);
                        var cesLayer = product._cesiumLayer;
                        if (cesLayer &&
                           (typeof cesLayer.imageryProvider.updateProperties === 'function')) {
                            cesLayer.imageryProvider.updateProperties('time', string);
                            if (cesLayer.show) {
                                var index = this.map.scene.imageryLayers.indexOf(cesLayer);
                                this.map.scene.imageryLayers.remove(cesLayer, false);
                                this.map.scene.imageryLayers.add(cesLayer, index);
                            }
                        }
                    }
                }
            }, this);
            this.updateFieldLines();
        },

        onSetExtent: function (bbox) {
            //this.map.zoomToExtent(bbox);
            /*this.map.scene.camera.flyToRectangle({
              destination: Cesium.Rectangle.fromDegrees(bbox[0], bbox[1], bbox[2], bbox[3])
            });*/
        },

        onChangeZoom: function (zoom) {
            if (zoom < 0) {
                this.map.scene.camera.zoomOut(Math.abs(zoom));
            } else {
                this.map.scene.camera.zoomIn(Math.abs(zoom));
            }
        },


        onClose: function () {
            this.isClosed = true;
        },

        isModelCompatible: function (model) {
            var protocol = model.get('view').protocol;
            if (protocol === 'WMS' || protocol === 'WMTS') {
                return true;
            }
            return false;
        },

        isEventListenedTo: function (eventName) {
            return !!this._events[eventName];
        },

        onLoadImage: function (url, selection_bounds) {
        },

        onSaveImage: function () {
            this.map.canvas.toBlob(function (blob) {
                saveAs(blob, 'VirES_Services_Screenshot.jpg');
            }, 'image/jpeg', 1);
        },

        onClearImage: function () {
            if (this.diffOverlay) {
                this.map.removeLayer(this.diffOverlay);
                this.diffOverlay = null;
            }
        },


        handleTick: function (clock) {
            // TODO: Cesium does not provide a method to know when the camera has stopped,
            //       this approach is not ideal, when the movement mantains inertia difference
            //       values are very low and there are comparison errors.
            var c = this.map.scene.camera;
            var th = [10000, 10000, 10000];
            // If current mode is either Columbus or Scene2D lower threshold
            if (this.map.scene.mode === 1 || this.map.scene.mode === 2) {
                th = [0, 0, 0];
            }
            if (!this.cameraIsMoving) {
                if (Math.abs(this.cameraLastPosition.x - c.position.x) > th[0] &&
                    Math.abs(this.cameraLastPosition.y - c.position.y) > th[1] &&
                    Math.abs(this.cameraLastPosition.z - c.position.z) >= th[2]) {
                    this.cameraIsMoving = true;
                }
            } else {
                if (Math.abs(this.cameraLastPosition.x - c.position.x) <= th[0] &&
                    Math.abs(this.cameraLastPosition.y - c.position.y) <= th[1] &&
                    Math.abs(this.cameraLastPosition.z - c.position.z) <= th[2]) {
                    this.cameraIsMoving = false;
                    Communicator.mediator.trigger('map:position:change', this.getMapExtent());
                    localStorage.setItem('cameraPosition', JSON.stringify({
                        position: [c.position.x, c.position.y, c.position.z],
                        direction: [c.direction.x, c.direction.y, c.direction.z],
                        up: [c.up.x, c.up.y, c.up.z],
                        right: [c.right.x, c.right.y, c.right.z]
                    }));

                    if (this.map.scene.mode === 2) {
                        localStorage.setItem('frustum', JSON.stringify({
                            bottom: c.frustum.bottom,
                            left: c.frustum.left,
                            right: c.frustum.right,
                            top: c.frustum.top
                        }));
                    } else {
                        localStorage.removeItem('frustum');
                    }


                } else {
                    this.cameraLastPosition.x = c.position.x;
                    this.cameraLastPosition.y = c.position.y;
                    this.cameraLastPosition.z = c.position.z;
                }
            }
        },

        wrapBbox: function (box) {
            // accepts bbox object{n:float, s:float, w:float, e:float}
            // returns bbox with numeric values fit to (-180, 180, -90, 90), performing switching n->s and w->e if necessary
            // cant solve over-dateline jumps
            var bbox = _.clone(box);
            // switch north and south if necessary
            if (bbox.n < bbox.s) {
                var tempS = bbox.s;
                bbox.s = bbox.n;
                bbox.n = tempS;
            }
            // fits to lat boundaries
            bbox.n = Math.min(bbox.n, 90);
            bbox.s = Math.max(bbox.s, -90);
            // fits to lon max boundaries if difference greater than 360
            if (bbox.e - bbox.w > 360) {
                bbox.w = -180;
                bbox.e = 180;
            }
            // fits lon boundaries to -180,180 range
            _.each(bbox, function (coord, key, obj) {
                while (coord > 180) {
                    coord -= 360;
                    obj[key] = coord;
                }
                while (coord < -180) {
                    coord += 360;
                    obj[key] = coord;
                }
            });
            // switch east and west if necessary
            if (bbox.e < bbox.w) {
                var tempE = bbox.e;
                bbox.e = bbox.w;
                bbox.w = tempE;
            }
            return bbox;
        },

        submitCoordinateForms: function () {
            // coordinate form validation and event emitting
            var w = parseFloat($('#bboxWestForm').val().replace(',', '.'));
            var e = parseFloat($('#bboxEastForm').val().replace(',', '.'));
            var n = parseFloat($('#bboxNorthForm').val().replace(',', '.'));
            var s = parseFloat($('#bboxSouthForm').val().replace(',', '.'));
            if (!isNaN(w) && !isNaN(e) && !isNaN(n) && !isNaN(s) && w !== e && n !== s) {
                // valid values inserted
                var bbox = {
                    "w": w,
                    "e": e,
                    "n": n,
                    "s": s,
                };
                // fix bbox if necessary
                var bboxFixed = this.wrapBbox(bbox);

                $("#bboxEditConfirm").removeClass("wrongBboxFormInput");
                $('.bboxEdit').addClass('hidden');
                Communicator.mediator.trigger('selection:changed', bboxFixed);
                Communicator.mediator.trigger('selection:activated', {
                    id: 'bboxSelection',
                    active: false,
                    selectionType: 'single'
                });
            } else {
                // invalid input
                $("#bboxEditConfirm").addClass("wrongBboxFormInput");
            }
        },

        cameraCustomZoomOnWheel: function (e) {
            var camera = this.map.scene.camera;
            var cameraHeight = Cesium.Ellipsoid.WGS84.cartesianToCartographic(camera.position).height;
            // make camera zoom depend on height
            var moveRate = cameraHeight / 10.0;
            if (e.originalEvent.deltaY < 0) {
                // scrolling up
                camera.moveForward(moveRate);
            }
            if (e.originalEvent.deltaY > 0) {
                camera.moveBackward(moveRate);
            }
        },

        polarViewZoom: function () {
            $(".poleButton").removeClass("viewActive");
            $("#poleViewButton").addClass("viewActive");
            this.map.scene.screenSpaceCameraController.enableRotate = false;
            this.map.scene.screenSpaceCameraController.enableTranslate = false;
            this.map.scene.screenSpaceCameraController.enableTilt = false;
            this.map.scene.screenSpaceCameraController.enableLook = false;
            this.map.scene.screenSpaceCameraController.enableZoom = false;

            $('.cesium-widget').off('wheel');
            $('.cesium-widget').on('wheel', function (e) {
                this.cameraCustomZoomOnWheel(e);
            }.bind(this));
        },

        globalViewZoomReset: function () {
            $("#poleViewButton").text('Globe View');
            $(".poleButton").removeClass("viewActive");
            $("#poleViewButton").removeClass("viewActive");
            this.map.scene.screenSpaceCameraController.enableRotate = true;
            this.map.scene.screenSpaceCameraController.enableTranslate = true;
            this.map.scene.screenSpaceCameraController.enableTilt = true;
            this.map.scene.screenSpaceCameraController.enableLook = true;
            this.map.scene.screenSpaceCameraController.enableZoom = true;
            $('.cesium-widget').off('wheel');
        },

        bindPolarButtons: function () {
            $('.poleButton').off('click');
            // magnetic poles hardcoded as were in 1.1.2015 (igrf)
            $(".magN").click(function () {
                this.map.scene.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(-84.551, 83.075, 10000000),
                    orientation: {
                        direction: new Cesium.Cartesian3(-0.011449873133578228, 0.12003352097560159, -0.9927038099289358),
                        up: new Cesium.Cartesian3(-0.2418134773341136, 0.9629699323710552, 0.11922731033143948)
                    },
                    duration: 2,
                    complete: function () {
                        this.polarViewZoom();
                        $('#poleViewButton').text('Mag. North');
                        $(".magN").addClass("viewActive");
                    }.bind(this)
                });
            }.bind(this));

            // magnetic poles hardcoded as were in 1.1.2015 (igrf)
            $(".magS").click(function () {
                this.map.scene.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(125.738, -74.383, 10000000),
                    orientation: {
                        direction: new Cesium.Cartesian3(0.1572357407963758, -0.21851202199924571, 0.963083287186532),
                        up: new Cesium.Cartesian3(0.25309094759697687, -0.9337284667987544, -0.25317212037290326)
                    },
                    duration: 2,
                    complete: function () {
                        this.polarViewZoom();
                        $('#poleViewButton').text('Mag. South');
                        $(".magS").addClass("viewActive");
                    }.bind(this)
                });
            }.bind(this));

            $(".geoN").click(function () {
                this.map.scene.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(0, 90, 10000000),
                    duration: 2,
                    complete: function () {
                        this.polarViewZoom();
                        $('#poleViewButton').text('Geo. North');
                        $(".geoN").addClass("viewActive");
                    }.bind(this)
                });
            }.bind(this));

            $(".geoS").click(function () {
                this.map.scene.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(0, -90, 10000000),
                    duration: 2,
                    complete: function () {
                        this.polarViewZoom();
                        $('#poleViewButton').text('Geo. South');
                        $(".geoS").addClass("viewActive");
                    }.bind(this)
                });
            }.bind(this));

            $("#resetCameraView").click(function () {
                this.map.scene.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(20, 30, 10000000),
                    duration: 2,
                    complete: this.globalViewZoomReset.bind(this)
                });
            }.bind(this));
        },

        resetInitialView: function () {
            this.map.scene.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(20, 30, 10000000),
                duration: 0.2,
            });
        },

        toggleDebug: function () {
            this.map.scene.debugShowFramesPerSecond = !this.map.scene.debugShowFramesPerSecond;
        }
    });
    return CesiumView;
});
