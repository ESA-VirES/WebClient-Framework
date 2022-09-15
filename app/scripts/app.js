/* global $ _ jQuery d3 require showMessage defaultFor BitwiseInt */
/* global has get pop pick */

// model residual parameters
var MODEL_VARIABLES = {
    "B_NEC_res_": {
        "pattern": RegExp('B_NEC_res_(.+)'),
        "productTypes": ["SW_MAGx_LR_1B"],
        "name": "Magnetic field vector model residual",
        "range": [0, 750],
        "uom": "nT",
        "colorscale": "jet",
        "residuals": true
    }
};

var SPACECRAFT_TO_ID = {
    'A': 'Alpha',
    'B': 'Bravo',
    'C': 'Charlie',
    '-': 'NSC',
    'U': 'Upload',
};

var TIMESTAMP = 'Timestamp';

// parameters displayed by Cesium as scalars
var SCALAR_PARAM = [
    "F", "Flags_F", "Flags_B", "Ne", "Te", "Vs", "U_orbit",
    "Bubble_Index", "Bubble_Probability", "Flags_Bubble", "IRC", "FAC", "EEF",
    "Background_Ne", "Foreground_Ne", "PCP_flag", "Grad_Ne_at_100km", "Grad_Ne_at_50km",
    "Grad_Ne_at_20km", "Grad_Ne_at_PCP_edge", "ROD", "RODI10s", "RODI20s", "delta_Ne10s",
    "delta_Ne20s", "delta_Ne40s", "Num_GPS_satellites", "mVTEC", "mROT", "mROTI10s",
    "mROTI20s", "IBI_flag", "Ionosphere_region_flag", "IPIR_index", "Ne_quality_flag",
    "TEC_STD",
    "J_QD", "J_R", "J_CF_SemiQD", "J_DF_SemiQD", "Boundary_Flag", "Pair_Indicator",
    "Tn_msis", "Ti_meas_drift", "Ti_model_drift", "Flag_ti_meas", "Flag_ti_model",
    "M_i_eff", "M_i_eff_err", "M_i_eff_Flags", "M_i_eff_tbt_model",
    "V_i", "V_i_err", "V_i_Flags", "V_i_raw", "N_i", "N_i_err", "N_i_Flags",
    "T_e", "Phi_sc",
    "Vixh", "Vixv",
    // MIT TEC
    "L_value", "Width", "DR", "dL",
    // PPI FAC
    "Sigma", "PPI",
];

// parameters displayed by Cesium as vectors by Cesium (note that some of them
// are actually scalars and the vector orientation is taken from another
// parameter)
var VECTOR_PARAM = [
    "B_NEC", "B_NEC_resAC", "B_NEC_res_Model", "GPS_Position", "LEO_Position",
    "Relative_STEC_RMS", "Relative_STEC", "Absolute_STEC", "Absolute_VTEC", "Elevation_Angle",
    "dB_other", "dB_AOCS", "dB_Sun",
    "J_NE", "J_T_NE", "J_CF_NE", "J_DF_NE",
    "V_sat_nec",
    "VsatNEC",
    "Viy", "Viz", "Vixy", "Vixz", "Viyz", "Eh", "Ev",
];

// breakdown of source vector parameters to their components
// (The data comes as vector from the server and it needs to be split into
// components by the client.)
var VECTOR_BREAKDOWN = {};
var REVERSE_VECTOR_BREAKDOWN = {};

// composition of source scalars to vectors
// (The data comes as set of separate scalar components which needs to be
// composed to a vector in the client.)
var VECTOR_COMPOSITION = {};
var REVERSE_VECTOR_COMPOSITION = {};

// derived parameters
var DERIVED_PARAMETERS = {}
var REVERSE_DERIVED_PARAMETERS = {}

// Ordered from highest resolution to lowest with the exception of FAC that
// needs to be first as the master product needs to be the same
var MASTER_PRIORITY = [
    'SW_OPER_FACATMS_2F', 'SW_OPER_FACBTMS_2F', 'SW_OPER_FACCTMS_2F', 'SW_OPER_FAC_TMS_2F', 'SW_OPER_FACUTMS_2F',
    'SW_OPER_EFIA_LP_1B', 'SW_OPER_EFIB_LP_1B', 'SW_OPER_EFIC_LP_1B', 'SW_OPER_EFIU_LP_1B',
    'SW_OPER_EFIATIE_2_', 'SW_OPER_EFIBTIE_2_', 'SW_OPER_EFICTIE_2_', 'SW_OPER_EFIUTIE_2_',
    'SW_PREL_EFIAIDM_2_', 'SW_PREL_EFIBIDM_2_', 'SW_PREL_EFICIDM_2_', 'SW_PREL_EFIUIDM_2_',
    'SW_EXPT_EFIA_TCT02', 'SW_EXPT_EFIB_TCT02', 'SW_EXPT_EFIC_TCT02', 'SW_EXPT_EFIC_TCT02',
    'SW_OPER_MAGA_LR_1B', 'SW_OPER_MAGB_LR_1B', 'SW_OPER_MAGC_LR_1B', 'SW_OPER_MAGU_LR_1B',
    'SW_OPER_TECATMS_2F', 'SW_OPER_TECBTMS_2F', 'SW_OPER_TECCTMS_2F', 'SW_OPER_TECUTMS_2F',
    'SW_OPER_IBIATMS_2F', 'SW_OPER_IBIBTMS_2F', 'SW_OPER_IBICTMS_2F', 'SW_OPER_IBIUTMS_2F',
    'SW_OPER_EEFATMS_2F', 'SW_OPER_EEFBTMS_2F', 'SW_OPER_EEFCTMS_2F', 'SW_OPER_EEFUTMS_2F',
    'SW_OPER_AEJALPS_2F', 'SW_OPER_AEJBLPS_2F', 'SW_OPER_AEJCLPS_2F', 'SW_OPER_AEJULPS_2F',
    'SW_OPER_AEJALPL_2F', 'SW_OPER_AEJBLPL_2F', 'SW_OPER_AEJCLPL_2F', 'SW_OPER_AEJULPL_2F',
];

// variable translations
var REPLACED_SCALAR_VARIABLES = {
    'B_resAC_N': 'B_N_resAC',
    'B_resAC_E': 'B_E_resAC',
    'B_resAC_C': 'B_C_resAC'
};

// related data collections
var RELATED_COLLECTIONS = {
    'SW_OPER_AEJALPS_2F': [
        {
            timeSliderDataset: 'SW_OPER_AEJAPBS_2F',
            collections: ['SW_OPER_AEJAPBS_2F', 'SW_OPER_AEJALPS_2F'],
            type: 'AEJ_PBS'
        },
        {
            collections: ['SW_OPER_AEJAPBS_2F:GroundMagneticDisturbance'],
            type: 'AEJ_PBS:GroundMagneticDisturbance'
        }
    ],
    'SW_OPER_AEJBLPS_2F': [
        {
            timeSliderDataset: 'SW_OPER_AEJBPBS_2F',
            collections: ['SW_OPER_AEJBPBS_2F', 'SW_OPER_AEJBLPS_2F'], type: 'AEJ_PBS'
        },
        {
            collections: ['SW_OPER_AEJBPBS_2F:GroundMagneticDisturbance'],
            type: 'AEJ_PBS:GroundMagneticDisturbance'
        }
    ],
    'SW_OPER_AEJCLPS_2F': [
        {
            timeSliderDataset: 'SW_OPER_AEJCPBS_2F',
            collections: ['SW_OPER_AEJCPBS_2F', 'SW_OPER_AEJCLPS_2F'],
            type: 'AEJ_PBS'
        },
        {
            collections: ['SW_OPER_AEJCPBS_2F:GroundMagneticDisturbance'],
            type: 'AEJ_PBS:GroundMagneticDisturbance'
        }
    ],
    'SW_OPER_AEJALPL_2F': [
        {
            timeSliderDataset: 'SW_OPER_AEJAPBL_2F',
            collections: ['SW_OPER_AEJAPBL_2F'],
            type: 'AEJ_PBL'
        }
    ],
    'SW_OPER_AEJBLPL_2F': [
        {
            timeSliderDataset: 'SW_OPER_AEJBPBL_2F',
            collections: ['SW_OPER_AEJBPBL_2F'],
            type: 'AEJ_PBL'
        }
    ],
    'SW_OPER_AEJCLPL_2F': [
        {
            timeSliderDataset: 'SW_OPER_AEJCPBL_2F',
            collections: ['SW_OPER_AEJCPBL_2F'],
            type: 'AEJ_PBL'
        }
    ],
    'SW_OPER_FACATMS_2F': [
        {
            timeSliderDataset: 'SW_OPER_AOBAFAC_2F',
            collections: ['SW_OPER_AOBAFAC_2F', 'SW_OPER_FACATMS_2F'],
            type: 'AOB_FAC'
        }
    ],
    'SW_OPER_FACBTMS_2F': [
        {
            timeSliderDataset: 'SW_OPER_AOBBFAC_2F',
            collections: ['SW_OPER_AOBBFAC_2F', 'SW_OPER_FACBTMS_2F'],
            type: 'AOB_FAC'
        }
    ],
    'SW_OPER_FACCTMS_2F': [
        {
            timeSliderDataset: 'SW_OPER_AOBCFAC_2F',
            collections: ['SW_OPER_AOBCFAC_2F', 'SW_OPER_FACCTMS_2F'],
            type: 'AOB_FAC'
        }
    ],
    'SW_OPER_EFIA_LP_1B': [
        {
            timeSliderDataset: 'SW_OPER_MITA_LP_2F',
            collections: ['SW_OPER_MITA_LP_2F:ID'],
            type: 'MIT_LP'
        }
    ],
    'SW_OPER_EFIB_LP_1B': [
        {
            timeSliderDataset: 'SW_OPER_MITB_LP_2F',
            collections: ['SW_OPER_MITB_LP_2F:ID'],
            type: 'MIT_LP'
        }
    ],
    'SW_OPER_EFIC_LP_1B': [
        {
            timeSliderDataset: 'SW_OPER_MITC_LP_2F',
            collections: ['SW_OPER_MITC_LP_2F:ID'],
            type: 'MIT_LP'
        }
    ],
};

var _COMMON_RELATED_VARIABLES = [
    'QDLat', 'QDLon', 'MLT', 'Kp', 'Dst', 'dDst', 'F107',
    'QDOrbitDirection', 'OrbitDirection',
];
var RELATED_VARIABLES = {
    'AEJ_PBS': ['J_DF_SemiQD', 'J_CF_SemiQD', 'J_R', 'PointType'].concat(_COMMON_RELATED_VARIABLES),
    'AEJ_PBS:GroundMagneticDisturbance': [].concat(_COMMON_RELATED_VARIABLES),
    'AEJ_PBL': ['J_QD', 'PointType'].concat(_COMMON_RELATED_VARIABLES),
    'AOB_FAC': ['FAC', 'Radius', 'Boundary_Flag'].concat(_COMMON_RELATED_VARIABLES),
    'MIT_LP': ['Ne', 'Te', 'PointType'],
};

(function () {
    'use strict';

    var root = this;

    root.define([
        'backbone',
        'globals',
        'regions/DialogRegion',
        'regions/UIRegion',
        'layouts/LayerControlLayout',
        'layouts/ToolControlLayout',
        'layouts/OptionsLayout',
        'core/SplitView/WindowView',
        'communicator',
        'viresFilters',
        'jquery',
        'backbone.marionette',
        'controller/ContentController',
        'controller/DownloadController',
        'controller/UploadController',
        'controller/SelectionManagerController',
        'controller/LoadingController',
        'controller/LayerController',
        'controller/SelectionController',
        'controller/DataController',
        'd3',
        'graphly',
    ],

    function (
        Backbone, globals, DialogRegion, UIRegion, LayerControlLayout,
        ToolControlLayout, OptionsLayout, WindowView, Communicator,
        viresFilters
    ) {

        var Application = Backbone.Marionette.Application.extend({
            initialize: function (options) {
            },

            configure: function (config) {

                // Load jquery UI tooltip tool

                /*$(document).ready(function() {
                    $("body").tooltip({
                        selector: '[data-toggle=tooltip]',
                        position: { my: "left+5 center", at: "right center" },
                        hide: { effect: false, duration: 0 },
                        show:{ effect: false, delay: 700}
                    });

                });*/

                var savedChangesApplied = false;

                $("body").tooltip({
                    selector: '[data-toggle=tooltip]',
                    position: {my: "left+5 center", at: "right center"},
                    hide: {effect: false, duration: 0},
                    show: {effect: false, delay: 700}
                });

                var imagerenderercanvas = $('<canvas/>', {id: 'imagerenderercanvas'});
                $('body').append(imagerenderercanvas);

                var v = {}; //views
                var m = {}; //models
                var t = {}; //templates

                // Application regions are loaded and added to the Marionette Application
                _.each(config.regions, function (region) {
                    var obj = {};
                    obj[region.name] = "#" + region.name;
                    this.addRegions(obj);
                    console.log("Added region " + obj[region.name]);
                }, this);

                //Load all configured views
                _.each(config.views, function (viewDef) {
                    var View = require(viewDef);
                    $.extend(v, View);
                }, this);

                //Load all configured models
                _.each(config.models, function (modelDef) {
                    var Model = require(modelDef);
                    $.extend(m, Model);
                }, this);

                //Load all configured templates
                _.each(config.templates, function (tmplDef) {
                    var Tmpl = require(tmplDef.template);
                    t[tmplDef.id] = Tmpl;
                }, this);

                this.templates = t;
                this.views = v;

                //Map attributes are loaded and added to the global map model
                globals.objects.add('mapmodel', new m.MapModel({
                    visualizationLibs: config.mapConfig.visualizationLibs,
                    center: config.mapConfig.center,
                    zoom: config.mapConfig.zoom,
                    sun: _.has(config.mapConfig, 'showSun') ? config.mapConfig.showSun : true,
                    moon: _.has(config.mapConfig, 'showMoon') ? config.mapConfig.showMoon : true,
                    skyBox: _.has(config.mapConfig, 'showSkyBox') ? config.mapConfig.showSkyBox : true,
                    skyAtmosphere: _.has(config.mapConfig, 'skyAtmosphere') ? config.mapConfig.skyAtmosphere : true,
                    backgroundColor: _.has(config.mapConfig, 'backgroundColor') ? config.mapConfig.backgroundColor : "#000"
                })
                );

                // Check compatibility of the saved configuration.

                var serviceVersion = JSON.parse(localStorage.getItem('serviceVersion'));

                if (!_.contains(globals.supportedVersions, serviceVersion)) {
                    // The version of the loaded configuration is not in the
                    // list of supported version. The client does not know
                    // how to handle it and gets reset to its default state.
                    showMessage('success',
                        'A new version (' + globals.version + ') of the service has been released. ' +
                        'Your configuration has been updated.</br>' +
                        'You can find information on the changes in the ' +
                        '<b><a target="_blank" href="/changelog">changelog</a></b>.', 35
                    );
                    localStorage.clear();
                }

                // migrate configuration

                var translateKeys = function (object, translation_table) {
                    _.each(object, function (value, key) {
                        if (has(translation_table, key)) {
                            object[translation_table[key]] = object[key];
                            delete object[key];
                        }
                    });
                    return object;
                };

                var convertRangeFilters = function (object) {
                    _.each(object, function (value, key) {
                        if (Array.isArray(value)) {
                            object[key] = viresFilters.createRangeFilter(value[0], value[1]);
                        }
                    });
                    return object;
                };

                var translate = function (translation_table) {
                    return function (key) {
                        return translation_table[key] || key;
                    };
                };

                var translateItems = function (array, translation_table) {
                    return _.map(array, translate(translation_table));
                };


                var translatePropertyItems = function (keys, translation_table) {
                    return function (object) {
                        _.each(keys, function (key) {
                            object[key] = translateItems(object[key], translation_table);
                        });
                        return object;
                    };
                };

                if (JSON.parse(localStorage.getItem('parameterConfiguration')) !== null) {
                    localStorage.setItem('parameterConfiguration', JSON.stringify(
                        translateKeys(
                            JSON.parse(localStorage.getItem('parameterConfiguration')),
                            REPLACED_SCALAR_VARIABLES
                        )
                    ));
                }

                if (JSON.parse(localStorage.getItem('filterSelection')) !== null) {
                    localStorage.setItem('filterSelection', JSON.stringify(
                        convertRangeFilters(
                            translateKeys(
                                JSON.parse(localStorage.getItem('filterSelection')),
                                REPLACED_SCALAR_VARIABLES
                            )
                        )
                    ));
                }

                if (JSON.parse(localStorage.getItem('selectedFilterList')) !== null) {
                    localStorage.setItem('selectedFilterList', JSON.stringify(
                        translateItems(
                            JSON.parse(localStorage.getItem('selectedFilterList')),
                            REPLACED_SCALAR_VARIABLES
                        )
                    ));
                }

                if (JSON.parse(localStorage.getItem('xAxisSelection')) !== null) {
                    localStorage.setItem('xAxisSelection', JSON.stringify(
                        translate(REPLACED_SCALAR_VARIABLES)(
                            JSON.parse(localStorage.getItem('xAxisSelection'))
                        )
                    ));
                }

                if (JSON.parse(localStorage.getItem('plotConfiguration')) !== null) {
                    localStorage.setItem('plotConfiguration', JSON.stringify(
                        _.map(
                            JSON.parse(localStorage.getItem('plotConfiguration')),
                            translatePropertyItems(
                                ['yAxis', 'y2Axis', 'colorAxis', 'colorAxis2'],
                                REPLACED_SCALAR_VARIABLES
                            )
                        )
                    ));
                }

                localStorage.setItem('serviceVersion', JSON.stringify(globals.version));

                // Fill the shared paremeters from the product type configuration.
                var productTypes = get(config, "productTypes", {});
                config.mapConfig.products = _.map(config.mapConfig.products, function (product) {
                    if (has(product, "type") && has(productTypes, product.type)) {
                        product = _.extend({}, productTypes[product.type], product);
                    }
                    return product;
                });

                // extract vector breakdown and composition from the parameters configuration
                var updateVectorBreakdown = function (target, reverse, name, components) {
                    if (!components || has(target, name)) return;
                    target[name] = components;
                    for (var i = 0 ; i < components.length; ++i) {
                        reverse[components[i]] = {source: name, index: i};
                    }
                };

                var updateVectorComposition = function (target, reverse, name, components) {
                    if (!components || has(target, name)) return;
                    target[name] = components;
                    for (var i = 0 ; i < components.length; ++i) {
                        if (!has(reverse, components[i])) {
                            reverse[components[i]] = [];
                        }
                        reverse[components[i]].push({source: name, index: i});
                    }
                };

                var updateDerivedParameters = function (target, reverse, name, sources) {
                    if (!sources || has(target, name)) return;
                    target[name] = sources;
                    var sourceNames = _.keys(sources)
                    for (var i = 0, sourceName ; i < sourceNames.length; ++i) {
                        sourceName = sourceNames[i];
                        if (!has(reverse, sourceName)) {
                            reverse[sourceName] = [];
                        }
                        reverse[sourceName].push(name);
                    }
                };

                var extractVectorBreakdown = function (parameter, name) {
                    updateVectorComposition(VECTOR_COMPOSITION, REVERSE_VECTOR_COMPOSITION, name, get(parameter, "composeFrom"));
                    updateVectorBreakdown(VECTOR_BREAKDOWN, REVERSE_VECTOR_BREAKDOWN, name, get(parameter, "breakInto"));
                    updateDerivedParameters(DERIVED_PARAMETERS, REVERSE_DERIVED_PARAMETERS, name, get(parameter, "derivedFrom"));
                };

                _.each(config.mapConfig.products, function (product) {
                    _.each(product.parameters || {}, extractVectorBreakdown);
                    _.each(product.download_parameters || {}, extractVectorBreakdown);
                });

                //Base Layers are loaded and added to the global collection
                // If there are already saved baselayer config in the local
                // storage use that instead

                var activeBaselayer = 'Terrain-Light';
                if (localStorage.getItem('activeBaselayer') !== null) {
                    var activeBaselayer = JSON.parse(localStorage.getItem('activeBaselayer'));
                    savedChangesApplied = true;
                }

                _.each(config.mapConfig.baseLayers, function (baselayer) {
                    var visible = false;
                    if (activeBaselayer === baselayer.name) {
                        visible = true;
                    }

                    globals.baseLayers.add(
                        new m.LayerModel({
                            name: baselayer.name,
                            visible: visible,
                            view: {
                                id: baselayer.id,
                                urls: baselayer.urls,
                                protocol: baselayer.protocol,
                                projection: baselayer.projection,
                                attribution: baselayer.attribution,
                                matrixSet: baselayer.matrixSet,
                                style: baselayer.style,
                                format: baselayer.format,
                                resolutions: baselayer.resolutions,
                                maxExtent: baselayer.maxExtent,
                                gutter: baselayer.gutter,
                                buffer: baselayer.buffer,
                                units: baselayer.units,
                                transitionEffect: baselayer.transitionEffect,
                                isphericalMercator: baselayer.isphericalMercator,
                                isBaseLayer: true,
                                wrapDateLine: baselayer.wrapDateLine,
                                zoomOffset: baselayer.zoomOffset,
                                //time: baselayer.time // Is set in TimeSliderView on time change.
                            },
                            views: baselayer.views
                        })
                    );
                    console.log("Added baselayer " + baselayer.id);
                }, this);

                var autoColor = {
                    colors: d3.scale.category10(),
                    index: 0,
                    getColor: function () {return this.colors(this.index++);}
                };

                //Products are loaded and added to the global collection
                var ordinal = 0;
                var domain = [];
                var range = [];

                // Remove three first colors as they are used by the products
                autoColor.getColor();autoColor.getColor();autoColor.getColor();

                // If there are already saved product config in the local
                // storage use that instead

                if (localStorage.getItem('productsConfiguration') !== null) {

                    var productConfiguration = JSON.parse(
                        localStorage.getItem('productsConfiguration')
                    );

                    _.each(config.mapConfig.products, function (dst) {
                        // Check if there is something to configure
                        // We only allow configuration of specific attributes
                        var src = get(productConfiguration, dst.download.id);

                        if (!src) {return;}

                        _.extend(dst, pick(src, ['visible', 'outlines', 'opacity']));

                        if (has(src, 'components')) {
                            // translate renamed models
                            dst.components = _.map(src.components, function (component) {
                                var table = config.magneticModels.modelIdTranslation || {};
                                component.id = table[component.id] || component.id;
                                return component;
                            });
                        }

                        if (has(src, 'parameters')) {
                            // Find default selected variable and clear the flags.
                            var selectedVariable = null;
                            _.each(dst.parameters, function (dstParam, variable) {
                                if (pop(dstParam, 'selected') && !selectedVariable) {
                                    selectedVariable = variable;
                                }
                            });

                            // Go through parameters and copy attributes.
                            _.each(src.parameters, function (srcParam, variable) {
                                var dstParam = get(dst.parameters, variable);
                                if (!dstParam) {
                                    // Handle model specific variables not present
                                    // in the loaded configuration.
                                    var modelParam = _.find(MODEL_VARIABLES, function (item) {
                                        var match = variable.match(item.pattern);
                                        return match && has(productConfiguration, match[1]);
                                    });
                                    if (modelParam) {
                                        dst.parameters[variable] = dstParam = _.clone(modelParam);
                                    }
                                }
                                if (dstParam) {
                                    if (get(srcParam, 'selected')) {
                                        // Override the selected variable.
                                        selectedVariable = variable;
                                    }
                                    _.extend(dstParam, pick(srcParam, ['range', 'colorscale']));
                                }
                            });

                            // Flag the final selected variable.
                            if (selectedVariable) {
                                dst.parameters[selectedVariable].selected = true;
                            }
                        }
                    }, this);

                    savedChangesApplied = true;
                }

                _.each(config.mapConfig.products, function (product) {
                    var p_color = product.color ? product.color : autoColor.getColor();
                    var lm = new m.LayerModel({
                        name: product.name,
                        type: product.type,
                        visible: product.visible,
                        ordinal: ordinal,
                        timeSlider: product.timeSlider,
                        // Default to WMS if no protocol is defined
                        timeSliderProtocol: product.timeSliderProtocol || "WMS",
                        timeSliderWpsProcessName: product.timeSliderWpsProcessName || null,
                        color: p_color,
                        //time: products.time, // Is set in TimeSliderView on time change.
                        opacity: defaultFor(product.opacity, 1),
                        views: product.views,
                        view: {isBaseLayer: false},
                        download: {
                            id: product.download.id,
                            protocol: product.download.protocol,
                            url: product.download.url
                        },
                        processes: product.processes,
                        unit: product.unit,
                        parameters: product.parameters,
                        download_parameters: product.download_parameters,
                        height: product.height,
                        outlines: product.outlines,
                        model: product.model,
                        satellite: product.satellite,
                        tileSize: (product.tileSize) ? product.tileSize : 256,
                        validity: product.validity,
                        showColorscale: true
                    });

                    if (lm.get('model')) {
                        lm.set({
                            components: defaultFor(product.components, []),
                            editable: defaultFor(product.editable, true),
                            contours: defaultFor(product.contours, false)
                        });
                    }

                    globals.products.add(lm);

                    if (product.processes) {
                        domain.push(product.processes[0].layer_id);
                        range.push(p_color);
                    }

                    console.log("Added product " + product.name);
                }, this);

                var productcolors = d3.scale.ordinal().domain(domain).range(range);

                globals.objects.add('productcolors', productcolors);

                // registering magnetic models
                _.each(config.magneticModels.models, function (model_conf) {
                    globals.models.config[model_conf.id] = model_conf;
                    if (model_conf.isCustomModel) {
                        // only one custom model allowed
                        if (globals.models.customModelId) {
                            console.error(
                                "Multiple custom models are not allowed!" +
                              "Model " + model_conf.id + "is skipped."
                            );
                            return;
                        }
                        globals.models.customModelId = model_conf.id;
                        var shcFile = JSON.parse(localStorage.getItem('shcFile'));
                        if (shcFile) {
                            globals.models.setCustomModel(shcFile.data, shcFile.filename);
                        }
                        console.log("Added custom model " + model_conf.id);
                    } else {
                        globals.models.add({name: model_conf.id});
                        console.log("Added model " + model_conf.id);
                    }
                });

                // periodic update magnetic models' metadata
                globals.models.url = config.magneticModels.infoUrl;
                globals.models.on('fetch:success', function () {
                    Communicator.mediator.trigger('models:update');
                });

                // TODO: There is one initial request where sending is not counted
                // but the AJAX Response is. This sets the event counter negative
                // for now I add the event change here but I am not sure which
                // request is actually responsible for this
                /*Communicator.mediator.trigger("progress:change", true);
                Communicator.mediator.trigger("progress:change", true);*/

                globals.models.fetch();
                window.setInterval(function () {globals.models.fetch();}, 900000); // refresh each 15min

                // If there is already saved overly configuration use that
                var activeOverlays = [];
                if (localStorage.getItem('activeOverlays') !== null) {
                    activeOverlays = JSON.parse(localStorage.getItem('activeOverlays'));
                    savedChangesApplied = true;
                }
                //Overlays are loaded and added to the global collection
                _.each(config.mapConfig.overlays, function (overlay) {
                    var overlayActive = false;
                    if (activeOverlays.indexOf(overlay.name) !== -1) {
                        overlayActive = true;
                    }
                    globals.overlays.add(
                        new m.LayerModel({
                            name: overlay.name,
                            visible: overlayActive,
                            ordinal: ordinal,
                            view: overlay.view
                        })
                    );
                    console.log("Added overlay " + overlay.name);
                }, this);

                // configure download parameters
                globals.download.set(config.download);

                // fetch user data info
                _.extend(globals.userData, config.userData);

                var userDataChanged = function () {
                    Communicator.mediator.trigger('userData:change');
                    Communicator.mediator.trigger('layers:refresh');
                };

                globals.userData.on('destroy', userDataChanged);
                globals.userData.on('sync', userDataChanged);

                globals.userData.fetch();

                // If Navigation Bar is set in configuration go through the
                // defined elements creating a item collection to rendered
                // by the marionette collection view
                if (config.navBarConfig) {

                    var addNavBarItems = defaultFor(self.NAVBARITEMS, []);
                    config.navBarConfig.items = config.navBarConfig.items.concat(addNavBarItems);
                    var navBarItemCollection = new m.NavBarCollection;

                    _.each(config.navBarConfig.items, function (list_item) {
                        navBarItemCollection.add(
                            new m.NavBarItemModel(list_item)
                        );
                    }, this);

                    this.topBar.show(new v.NavBarCollectionView({
                        template: t.NavBar({
                            title: config.navBarConfig.title,
                            url: config.navBarConfig.url
                        }),
                        className: "navbar navbar-inverse navbar-fixed-top not-selectable",
                        itemView: v.NavBarItemView, tag: "div",
                        collection: navBarItemCollection
                    }));

                }

                // Added region to test combination of backbone
                // functionality combined with jQuery UI
                this.addRegions({dialogRegion: DialogRegion.extend({el: "#viewContent"})});
                this.DialogContentView = new v.ContentView({
                    template: {type: 'handlebars', template: t.Info},
                    id: "about",
                    className: "modal fade",
                    attributes: {
                        role: "dialog",
                        tabindex: "-1",
                        "aria-labelledby": "about-title",
                        "aria-hidden": true,
                        "data-keyboard": true,
                        "data-backdrop": "static"
                    }
                });

                // Create the views - these are Marionette.CollectionViews that render ItemViews
                this.baseLayerView = new v.BaseLayerSelectionView({
                    collection: globals.baseLayers,
                    itemView: v.LayerItemView.extend({
                        template: {
                            type: 'handlebars',
                            template: t.BulletLayer
                        },
                        className: "radio-inline"
                    })
                });

                // We want to have the full list of products as the underlying
                // system works in this manner but in order to accommodate the
                // concept of one product with three satellites we remove here
                // Each three products and combine them to one, the logic for
                // "separating" them is then done when activating one of this
                // "special products"

                var filtered = globals.products.filter(function (product) {
                    var id = product.get("download").id;
                    return !(id && id.match(
                        /^SW_(OPER|PREL|EXPT)_(MAG|EFI|IBI|TEC|FAC|EEF|IPD|AEJ|MIT|PPI)[ABCU_]/
                    ));
                });


                globals.swarm.products = {
                    "MAG": {
                        "Alpha": "SW_OPER_MAGA_LR_1B",
                        "Bravo": "SW_OPER_MAGB_LR_1B",
                        "Charlie": "SW_OPER_MAGC_LR_1B",
                        "Upload": "SW_OPER_MAGU_LR_1B",
                    },
                    "EFI": {
                        "Alpha": "SW_OPER_EFIA_LP_1B",
                        "Bravo": "SW_OPER_EFIB_LP_1B",
                        "Charlie": "SW_OPER_EFIC_LP_1B",
                        "Upload": "SW_OPER_EFIU_LP_1B",
                    },
                    "EFI_TIE": {
                        "Alpha": "SW_OPER_EFIATIE_2_",
                        "Bravo": "SW_OPER_EFIBTIE_2_",
                        "Charlie": "SW_OPER_EFICTIE_2_",
                        "Upload": "SW_OPER_EFIUTIE_2_",
                    },
                    "EFI_IDM": {
                        "Alpha": "SW_PREL_EFIAIDM_2_",
                        "Bravo": "SW_PREL_EFIBIDM_2_",
                        "Charlie": "SW_PREL_EFICIDM_2_",
                        "Upload": "SW_PREL_EFIUIDM_2_",
                    },
                    "EFI_TCT": {
                        "Alpha": "SW_EXPT_EFIA_TCT02",
                        "Bravo": "SW_EXPT_EFIB_TCT02",
                        "Charlie": "SW_EXPT_EFIC_TCT02",
                        "Upload": "SW_EXPT_EFIU_TCT02",
                    },
                    "IBI": {
                        "Alpha": "SW_OPER_IBIATMS_2F",
                        "Bravo": "SW_OPER_IBIBTMS_2F",
                        "Charlie": "SW_OPER_IBICTMS_2F",
                        "Upload": "SW_OPER_IBIUTMS_2F",
                    },
                    "TEC": {
                        "Alpha": "SW_OPER_TECATMS_2F",
                        "Bravo": "SW_OPER_TECBTMS_2F",
                        "Charlie": "SW_OPER_TECCTMS_2F",
                        "Upload": "SW_OPER_TECUTMS_2F"
                    },
                    "FAC": {
                        "Alpha": "SW_OPER_FACATMS_2F",
                        "Bravo": "SW_OPER_FACBTMS_2F",
                        "Charlie": "SW_OPER_FACCTMS_2F",
                        "Upload": "SW_OPER_FACUTMS_2F",
                        "NSC": "SW_OPER_FAC_TMS_2F",
                    },
                    "EEF": {
                        "Alpha": "SW_OPER_EEFATMS_2F",
                        "Bravo": "SW_OPER_EEFBTMS_2F",
                        "Charlie": "SW_OPER_EEFCTMS_2F",
                        "Upload": "SW_OPER_EEFUTMS_2F",
                    },
                    "IPD": {
                        "Alpha": "SW_OPER_IPDAIRR_2F",
                        "Bravo": "SW_OPER_IPDBIRR_2F",
                        "Charlie": "SW_OPER_IPDCIRR_2F",
                        "Upload": "SW_OPER_IPDUIRR_2F",
                    },
                    "AEJ_LPL": {
                        "Alpha": "SW_OPER_AEJALPL_2F",
                        "Bravo": "SW_OPER_AEJBLPL_2F",
                        "Charlie": "SW_OPER_AEJCLPL_2F",
                        "Upload": "SW_OPER_AEJULPL_2F",
                    },
                    "AEJ_LPS": {
                        "Alpha": "SW_OPER_AEJALPS_2F",
                        "Bravo": "SW_OPER_AEJBLPS_2F",
                        "Charlie": "SW_OPER_AEJCLPS_2F",
                        "Upload": "SW_OPER_AEJULPS_2F",
                    },
                    "MIT_TEC": {
                        "Alpha": "SW_OPER_MITATEC_2F",
                        "Bravo": "SW_OPER_MITBTEC_2F",
                        "Charlie": "SW_OPER_MITCTEC_2F",
                    },
                    "PPI_FAC": {
                        "Alpha": "SW_OPER_PPIAFAC_2F",
                        "Bravo": "SW_OPER_PPIBFAC_2F",
                        "Charlie": "SW_OPER_PPICFAC_2F",
                    }
                };

                globals.swarm.satellites = {
                    "Alpha": false,
                    "Bravo": false,
                    "Charlie": false,
                    "NSC": false,
                    "Upload": false
                };

                // reversed collection to satellite mapping
                var collection2satellite = {};
                var collection2type = {};
                _.each(globals.swarm.products, function (product, productType) {
                    _.each(product, function (collection, satellite) {
                        collection2satellite[collection] = satellite;
                        collection2type[collection] = productType;
                    });
                });
                globals.swarm.collection2satellite = collection2satellite;

                // Check if we have the satellites saved in localstorage
                if (localStorage.getItem('satellites')) {
                    globals.swarm.satellites = JSON.parse(localStorage.getItem('satellites'));
                } else {
                    // Derive which satellites should be active from active products
                    globals.products.forEach(function (product) {
                        var satellite = get(collection2satellite, product.get('download').id);
                        if (satellite && product.get('visible')) {
                            globals.swarm.satellites[satellite] = true;
                        }
                    });
                }

                // collection to product name mapping
                globals.swarm.collection2product = {};
                globals.products.forEach(function (product) {
                    globals.swarm.collection2product[product.get('download').id] = product.get('name');
                });

                globals.swarm.activeProducts = [];

                // because user data collection needs to have identifier USER_DATA
                var userDataId = globals.userData.views[0].id;
                if (userDataId) {
                    collection2satellite[userDataId] = 'Upload';
                }
                var filtered_collection = new Backbone.Collection(filtered);

                var containerSelection = {
                    'MAG': false,
                    'EFI': false,
                    'EFI_TIE': false,
                    'EFI_IDM': false,
                    'EFI_TCT': false,
                    'IBI': false,
                    'TEC': false,
                    'FAC': false,
                    'EEF': false,
                    'IPD': false,
                    'AEJ_LPL': false,
                    'AEJ_LPS': false,
                    'MIT_TEC': false,
                    'PPI_FAC': false,
                };

                var clickEvent = "require(['communicator'], function(Communicator){Communicator.mediator.trigger('application:reset');});";

                // Derive from product what container needs to be active
                globals.products.forEach(function (product) {
                    var productType = get(collection2type, product.get('download').id);
                    if (productType && product.get('visible')) {
                        containerSelection[productType] = true;
                    }
                });

                if (savedChangesApplied) {
                    showMessage('success',
                        'The configuration of your last visit has been loaded, ' +
                     'if you would like to reset to the default configuration click ' +
                     '<b><a href="javascript:void(0);" onclick="' + clickEvent + '">here</a></b> ' +
                     'or on the Workspace->Reset menu command above.', 35);

                    // Check if successful login info is being shown, if yes,
                    // add padding to not overlap messages
                    if ($('.alert.alert-success.fade.in').length > 0) {
                        $('.alert.alert-success.fade.in').css('margin-top', '100px');
                    }
                }

                var csKeys = _.keys(containerSelection);
                for (var i = csKeys.length - 1; i >= 0; i--) {
                    if (containerSelection[csKeys[i]]) {
                        var satKeys = _.keys(globals.swarm.products[csKeys[i]]);
                        for (var j = satKeys.length - 1; j >= 0; j--) {
                            if (globals.swarm.satellites[satKeys[j]]) {
                                globals.swarm.activeProducts.push(
                                    globals.swarm.products[csKeys[i]][satKeys[j]]
                                );
                            }
                        }
                    }
                }

                for (var i = globals.swarm.activeProducts.length - 1; i >= 0; i--) {
                    globals.products.forEach(function (p) {
                        if (p.get("download").id == globals.swarm.activeProducts[i]) {
                            if (!p.get("visible")) {
                                p.set("visible", true);
                            }
                        }
                    });
                }

                // Add generic product (which is container for A,B and C sats)
                filtered_collection.add({
                    name: "Midnight Plasmapause Index - (PPI FAC)",
                    visible: containerSelection['PPI_FAC'],
                    color: "#241620",
                    protocol: null,
                    containerproduct: true,
                    id: "PPI_FAC"
                }, {at: 0});
                filtered_collection.add({
                    name: "Midlatitude Ionospheric Trough - (MIT TEC)",
                    visible: containerSelection['MIT_TEC'],
                    color: "#645600",
                    protocol: null,
                    containerproduct: true,
                    id: "MIT_TEC"
                }, {at: 0});
                filtered_collection.add({
                    name: "Auroral Electrojet - SECS (AEJ LPS/PBS)",
                    visible: containerSelection['AEJ_LPS'],
                    color: "#145600",
                    protocol: null,
                    containerproduct: true,
                    id: "AEJ_LPS"
                }, {at: 0});
                filtered_collection.add({
                    name: "Auroral Electrojet - LC (AEJ LPL/PBL)",
                    visible: containerSelection['AEJ_LPL'],
                    color: "#024573",
                    protocol: null,
                    containerproduct: true,
                    id: "AEJ_LPL"
                }, {at: 0});
                filtered_collection.add({
                    name: "Ionospheric Plasma Irregularities (IPD IRR)",
                    visible: containerSelection['IPD'],
                    //color: "#b82e2e", # TODO: set a sensible colour
                    protocol: null,
                    containerproduct: true,
                    id: "IPD"
                }, {at: 0});
                filtered_collection.add({
                    name: "Equatorial electric field (EEF)",
                    visible: containerSelection['EEF'],
                    color: "#b82e2e",
                    protocol: null,
                    containerproduct: true,
                    id: "EEF"
                }, {at: 0});
                filtered_collection.add({
                    name: "Electric current data (FAC/FAC AOB)",
                    visible: containerSelection['FAC'],
                    color: "#66aa00",
                    protocol: null,
                    containerproduct: true,
                    id: "FAC"
                }, {at: 0});
                filtered_collection.add({
                    name: "Total electron content (TEC)",
                    visible: containerSelection['TEC'],
                    color: "#990099",
                    protocol: null,
                    containerproduct: true,
                    id: "TEC"
                }, {at: 0});
                filtered_collection.add({
                    name: "Bubble index data (IBI)",
                    visible: containerSelection['IBI'],
                    color: "#2ca02c",
                    protocol: null,
                    containerproduct: true,
                    id: "IBI"
                }, {at: 0});
                filtered_collection.add({
                    name: " Cross-satellite-track Ion Flow (EFI TII)",
                    visible: containerSelection['EFI_TCT'],
                    color: "#ec0b0b",
                    protocol: null,
                    containerproduct: true,
                    id: "EFI_TCT"
                }, {at: 0});
                filtered_collection.add({
                    name: "Ion drift, density and effective mass (EFI IDM)",
                    visible: containerSelection['EFI_IDM'],
                    color: "#ff7f0e",
                    protocol: null,
                    containerproduct: true,
                    id: "EFI_IDM"
                }, {at: 0});
                filtered_collection.add({
                    name: "Ion temperature (EFI TIE)",
                    visible: containerSelection['EFI_TIE'],
                    color: "#ef8ede",
                    protocol: null,
                    containerproduct: true,
                    id: "EFI_TIE"
                }, {at: 0});
                filtered_collection.add({
                    name: "Plasma data (EFI LP)",
                    visible: containerSelection['EFI'],
                    color: "#ff7f0e",
                    protocol: null,
                    containerproduct: true,
                    id: "EFI"
                }, {at: 0});
                filtered_collection.add({
                    name: "Magnetic data (MAG LR)",
                    visible: containerSelection['MAG'],
                    color: "#1f77b4",
                    protocol: null,
                    containerproduct: true,
                    id: "MAG"
                }, {at: 0});

                // Load possible additional tooltip information from config
                filtered_collection.forEach(function (item) {
                    if (has(config, "additionalInformation")
                        && has(config.additionalInformation, item.get("id"))) {
                        item.set("info", config.additionalInformation[item.get("id")].join(''));
                    }
                });

                this.productsView = new v.LayerSelectionView({
                    collection: filtered_collection,
                    itemView: v.LayerItemView.extend({
                        template: {
                            type: 'handlebars',
                            template: t.CheckBoxLayer},
                        className: "sortable-layer"
                    }),
                    className: "sortable"
                });

                globals.swarm["filtered_collection"] = filtered_collection;

                this.overlaysView = new v.BaseLayerSelectionView({
                    collection: globals.overlays,
                    itemView: v.LayerItemView.extend({
                        template: {
                            type: 'handlebars',
                            template: t.CheckBoxOverlayLayer},
                        className: "checkbox"
                    }),
                    className: "check"
                });

                // Create layout that will hold the child views
                this.layout = new LayerControlLayout();

                // Define collection of selection tools
                var selectionToolsCollection = new m.ToolCollection();
                _.each(config.selectionTools, function (selTool) {
                    selectionToolsCollection.add(
                        new m.ToolModel({
                            id: selTool.id,
                            description: selTool.description,
                            icon: selTool.icon,
                            enabled: true,
                            active: false,
                            type: "selection",
                            selectionType: selTool.selectionType
                        }));
                }, this);

                // Define collection of visualization tools
                var visualizationToolsCollection = new m.ToolCollection();
                _.each(config.visualizationTools, function (visTool) {
                    visualizationToolsCollection.add(
                        new m.ToolModel({
                            id: visTool.id,
                            eventToRaise: visTool.eventToRaise,
                            description: visTool.description,
                            disabledDescription: visTool.disabledDescription,
                            icon: visTool.icon,
                            enabled: visTool.enabled,
                            active: visTool.active,
                            type: "tool"
                        }));
                }, this);

                // Define collection of visualization modes
                var visualizationModesCollection = new m.ToolCollection();
                _.each(config.visualizationModes, function (visMode) {
                    visualizationModesCollection.add(
                        new m.ToolModel({
                            id: visMode.id,
                            eventToRaise: visMode.eventToRaise,
                            description: visMode.description,
                            icon: visMode.icon,
                            enabled: visMode.enabled,
                            active: visMode.active,
                            type: "vis_mode"
                        }));
                }, this);

                // Create Collection Views to hold set of views for selection tools
                this.visualizationToolsView = new v.ToolSelectionView({
                    collection: visualizationToolsCollection,
                    itemView: v.ToolItemView.extend({
                        template: {
                            type: 'handlebars',
                            template: t.ToolIcon}
                    })
                });

                // Create Collection Views to hold set of views for visualization tools
                this.selectionToolsView = new v.ToolSelectionView({
                    collection: selectionToolsCollection,
                    itemView: v.ToolItemView.extend({
                        template: {
                            type: 'handlebars',
                            template: t.ToolIcon}
                    })
                });

                // Create Collection Views to hold set of views for visualization modes
                this.visualizationModesView = new v.ToolSelectionView({
                    collection: visualizationModesCollection,
                    itemView: v.ToolItemView.extend({
                        template: {
                            type: 'handlebars',
                            template: t.ToolIcon
                        }
                    })
                });

                this.layerSettings = new v.LayerSettings();

                // Create layout to hold collection views
                this.toolLayout = new ToolControlLayout();
                this.optionsLayout = new OptionsLayout();

                // Instance timeslider view
                this.timeSliderView = new v.TimeSliderView(config.timeSlider);

                // Load possible available filter selection
                if (localStorage.getItem('filterSelection') !== null) {
                    var filters = JSON.parse(localStorage.getItem('filterSelection'));
                    globals.swarm.set('filters', filters);
                    Communicator.mediator.trigger('analytics:set:filter', filters);
                }
            },

            // The GUI is setup after the application is started. Therefore all modules
            // are already registered and can be requested to populate the GUI.
            setupGui: function () {

                // Starts the SplitView module and registers it with the Communicator.
                this.module('SplitView').start();
                var splitview = this.module('SplitView').createController();
                this.main.show(splitview.getView());


                // Show Timsliderview after creating modules to
                // set the selected time correctly to the products
                this.bottomBar.show(this.timeSliderView);

                // Show storybanner
                /*if(this.storyBanner){
                    this.storyView.show(this.storyBanner);
                }*/

                if ((typeof(Storage) !== "undefined") && localStorage.getItem("viewSelection") !== null) {
                    if (localStorage.getItem('viewSelection') == '"split"') {
                        splitview.setSplitscreen();
                    }
                    if (localStorage.getItem('viewSelection') == '"globe"') {
                        splitview.setSinglescreen('CesiumViewer');
                    }
                    if (localStorage.getItem('viewSelection') == '"analytics"') {
                        splitview.setSinglescreen('AVViewer');
                    }
                } else {
                    splitview.setSplitscreen();
                }

                // Try to get CSRF token, if available set it for necessary AJAX requests
                function getCookie(name) {
                    var cookieValue = null;
                    if (document.cookie && document.cookie != '') {
                        var cookies = document.cookie.split(';');
                        for (var i = 0; i < cookies.length; i++) {
                            var cookie = jQuery.trim(cookies[i]);
                            // Does this cookie string begin with the name we want?
                            if (cookie.substring(0, name.length + 1) == (name + '=')) {
                                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                                break;
                            }
                        }
                    }
                    return cookieValue;
                }
                var csrftoken = getCookie('csrftoken');

                function csrfSafeMethod(method) {
                    // these HTTP methods do not require CSRF protection
                    return (/^(GET|HEAD|OPTIONS|TRACE)$/.test(method));
                }

                if (csrftoken) {
                    $.ajaxSetup({
                        beforeSend: function (xhr, settings) {
                            if (!csrfSafeMethod(settings.type) && !this.crossDomain) {
                                xhr.setRequestHeader("X-CSRFToken", csrftoken);
                            }
                        }
                    });
                }

                // Add a trigger for AJAX calls in order to display loading state
                // in mouse cursor to give feedback to the user the client is busy
                $(document).ajaxStart(function () {
                    Communicator.mediator.trigger("progress:change", true);
                });

                $(document).ajaxStop(function () {
                    Communicator.mediator.trigger("progress:change", false);
                });

                $(document).ajaxError(function (event, request, settings, thrownError) {
                    if (settings.suppressErrors) {
                        return;
                    }
                    var error_text = request.responseText.match("<ows:ExceptionText>(.*)</ows:ExceptionText>");

                    if (error_text && error_text.length > 1) {
                        error_text = error_text[1];
                    } else {
                        error_text = 'Please contact feedback@vires.services if issue persists.';
                    }

                    showMessage('danger', ('Problem retrieving data: ' + error_text), 35);
                });

                $('.tab-header:contains(Download)').css("font-weight", "bold");

                // The tooltip is called twice at beginning and end, it seems to show the style of the
                // tooltips more consistently, there is some problem where sometimes no style is shown for tooltips
                $("body").tooltip({
                    selector: '[data-toggle=tooltip]',
                    position: {my: "left+5 center", at: "right center"},
                    hide: {effect: false, duration: 0},
                    show: {effect: false, delay: 700}
                });

                // Now that products and data are loaded make sure data controller is correctly initialized
                Communicator.mediator.trigger('manual:init');
                this.timeSliderView.manualInit();

                // Broadcast possible area selection
                if (localStorage.getItem('areaSelection') !== null) {
                    Communicator.mediator.trigger('selection:changed', JSON.parse(localStorage.getItem('areaSelection')));
                }

                Communicator.mediator.trigger('map:multilayer:change', globals.swarm.activeProducts);

                // Remove loading screen when this point is reached in the script
                $('#loadscreen').remove();

            }

        });

        return new Application();
    });
}).call(this);
