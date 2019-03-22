
var SCALAR_PARAM = [
    "F", "Ne", "Te", "Vs", "U_orbit", "Bubble_Index", "Bubble_Probability",
    "IRC", "FAC", "EEF"
];

var VECTOR_PARAM = [
    "B_NEC", "SIFM", "IGRF12", "CHAOS-6-Combined", "Custom_Model", "Magnetic_Model", 
    "B_NEC_resAC", "GPS_Position", "LEO_Position",
    "Relative_STEC_RMS", "Relative_STEC", "Absolute_STEC", "Absolute_VTEC", "Elevation_Angle",
    "MCO_SHA_2C", "MCO_SHA_2D", "MCO_SHA_2F", "MLI_SHA_2C", "MLI_SHA_2D", 
    "MMA_SHA_2C-Primary", "MMA_SHA_2C-Secondary", "MMA_SHA_2F-Primary", "MMA_SHA_2F-Secondary",
    "CHAOS-6-MMA-Primary", "CHAOS-6-MMA-Secondary",
    "MIO_SHA_2C-Primary", "MIO_SHA_2C-Secondary", "MIO_SHA_2D-Primary", "MIO_SHA_2D-Secondary",
    'dB_other', 'dB_AOCS', 'dB_Sun'
]
var VECTOR_BREAKDOWN = {
    'SIFM': ['B_N_res_SIFM','B_E_res_SIFM','B_C_res_SIFM'],
    'IGRF12': ['B_N_res_IGRF12','B_E_res_IGRF12','B_C_res_IGRF12'],
    'CHAOS-6-Combined': ['B_N_res_CHAOS-6-Combined','B_E_res_CHAOS-6-Combined','B_C_res_CHAOS-6-Combined'],
    'Custom_Model': ['B_N_res_Custom_Model','B_E_res_Custom_Model','B_C_res_Custom_Model'],
    'Magnetic_Model': ['B_N_res_Magnetic_Model','B_E_res_Magnetic_Model','B_C_res_Magnetic_Model'],
    'MCO_SHA_2C': ['B_N_res_MCO_SHA_2C','B_E_res_MCO_SHA_2C','B_C_res_MCO_SHA_2C'],
    'MCO_SHA_2D': ['B_N_res_MCO_SHA_2D','B_E_res_MCO_SHA_2D','B_C_res_MCO_SHA_2D'],
    'MCO_SHA_2F': ['B_N_res_MCO_SHA_2F','B_E_res_MCO_SHA_2F','B_C_res_MCO_SHA_2F'],
    'MLI_SHA_2C': ['B_N_res_MLI_SHA_2C','B_E_res_MLI_SHA_2C','B_C_res_MLI_SHA_2C'],
    'MLI_SHA_2D': ['B_N_res_MLI_SHA_2D','B_E_res_MLI_SHA_2D','B_C_res_MLI_SHA_2D'],
    'MMA_SHA_2C-Primary': ['B_N_res_MMA_SHA_2C-Primary','B_E_res_MMA_SHA_2C-Primary','B_C_res_MMA_SHA_2C-Primary'],
    'MMA_SHA_2C-Secondary': ['B_N_res_MMA_SHA_2C-Secondary','B_E_res_MMA_SHA_2C-Secondary','B_C_res_MMA_SHA_2C-Secondary'],
    'MMA_SHA_2F-Primary': ['B_N_res_MMA_SHA_2F-Primary','B_E_res_MMA_SHA_2F-Primary','B_C_res_MMA_SHA_2F-Primary'],
    'MMA_SHA_2F-Secondary': ['B_N_res_MMA_SHA_2F-Secondary','B_E_res_MMA_SHA_2F-Secondary','B_C_res_MMA_SHA_2F-Secondary'],
    'CHAOS-6-MMA-Primary': ['B_N_res_CHAOS-6-MMA-Primary','B_E_res_CHAOS-6-MMA-Primary','B_C_res_CHAOS-6-MMA-Primary'],
    'CHAOS-6-MMA-Secondary': ['B_N_res_CHAOS-6-MMA-Secondary','B_E_res_CHAOS-6-MMA-Secondary','B_C_res_CHAOS-6-MMA-Secondary'],
    'MIO_SHA_2C-Primary': ['B_N_res_MIO_SHA_2C-Primary','B_E_res_MIO_SHA_2C-Primary','B_C_res_MIO_SHA_2C-Primary'],
    'MIO_SHA_2C-Secondary': ['B_N_res_MIO_SHA_2C-Secondary','B_E_res_MIO_SHA_2C-Secondary','B_C_res_MIO_SHA_2C-Secondary'],
    'MIO_SHA_2D-Primary': ['B_N_res_MIO_SHA_2D-Primary','B_E_res_MIO_SHA_2D-Primary','B_C_res_MIO_SHA_2D-Primary'],
    'MIO_SHA_2D-Secondary': ['B_N_res_MIO_SHA_2D-Secondary','B_E_res_MIO_SHA_2D-Secondary','B_C_res_MIO_SHA_2D-Secondary'],
    'B_NEC': ['B_N','B_E','B_C'],
    'B_NEC_resAC': ['B_resAC_N','B_resAC_E','B_resAC_C'],
    'B_error': ['B_error_X', 'B_error_Y', 'B_error_Z'],
    'B_VFM': ['B_VFM_X', 'B_VFM_Y', 'B_VFM_Z'],
    'GPS_Position':  ['GPS_Position_X','GPS_Position_Y','GPS_Position_Z'],
    'LEO_Position':  ['LEO_Position_X','LEO_Position_Y','LEO_Position_Z'],
    'B_NEC_res_SIFM': ['B_N_res_SIFM','B_E_res_SIFM','B_C_res_SIFM'],
    'B_NEC_res_IGRF12': ['B_N_res_IGRF12','B_E_res_IGRF12','B_C_res_IGRF12'],
    'B_NEC_res_CHAOS-6-Combined': ['B_N_res_CHAOS-6-Combined','B_E_res_CHAOS-6-Combined','B_C_res_CHAOS-6-Combined'],
    'B_NEC_res_Custom_Model': ['B_N_res_Custom_Model','B_E_res_Custom_Model','B_C_res_Custom_Model'],
    'B_NEC_res_Magnetic_Model': ['B_N_res_Magnetic_Model','B_E_res_Magnetic_Model','B_C_res_Magnetic_Model'],
    'B_NEC_res_MCO_SHA_2C': ['B_N_res_MCO_SHA_2C','B_E_res_MCO_SHA_2C','B_C_res_MCO_SHA_2C'],
    'B_NEC_res_MCO_SHA_2D': ['B_N_res_MCO_SHA_2D','B_E_res_MCO_SHA_2D','B_C_res_MCO_SHA_2D'],
    'B_NEC_res_MCO_SHA_2F': ['B_N_res_MCO_SHA_2F','B_E_res_MCO_SHA_2F','B_C_res_MCO_SHA_2F'],
    'B_NEC_res_MLI_SHA_2C': ['B_N_res_MLI_SHA_2C','B_E_res_MLI_SHA_2C','B_C_res_MLI_SHA_2C'],
    'B_NEC_res_MLI_SHA_2D': ['B_N_res_MLI_SHA_2D','B_E_res_MLI_SHA_2D','B_C_res_MLI_SHA_2D'],
    'B_NEC_res_MMA_SHA_2C-Primary': ['B_N_res_MMA_SHA_2C-Primary','B_E_res_MMA_SHA_2C-Primary','B_C_res_MMA_SHA_2C-Primary'],
    'B_NEC_res_MMA_SHA_2C-Secondary': ['B_N_res_MMA_SHA_2C-Secondary','B_E_res_MMA_SHA_2C-Secondary','B_C_res_MMA_SHA_2C-Secondary'],
    'B_NEC_res_MMA_SHA_2F-Primary': ['B_N_res_MMA_SHA_2F-Primary','B_E_res_MMA_SHA_2F-Primary','B_C_res_MMA_SHA_2F-Primary'],
    'B_NEC_res_MMA_SHA_2F-Secondary': ['B_N_res_MMA_SHA_2F-Secondary','B_E_res_MMA_SHA_2F-Secondary','B_C_res_MMA_SHA_2F-Secondary'],
    'B_NEC_res_CHAOS-6-MMA-Primary': ['B_N_res_CHAOS-6-MMA-Primary','B_E_res_CHAOS-6-MMA-Primary','B_C_res_CHAOS-6-MMA-Primary'],
    'B_NEC_res_CHAOS-6-MMA-Secondary': ['B_N_res_CHAOS-6-MMA-Secondary','B_E_res_CHAOS-6-MMA-Secondary','B_C_res_CHAOS-6-MMA-Secondary'],
    'B_NEC_res_MIO_SHA_2C-Primary': ['B_N_res_MIO_SHA_2C-Primary','B_E_res_MIO_SHA_2C-Primary','B_C_res_MIO_SHA_2C-Primary'],
    'B_NEC_res_MIO_SHA_2C-Secondary': ['B_N_res_MIO_SHA_2C-Secondary','B_E_res_MIO_SHA_2C-Secondary','B_C_res_MIO_SHA_2C-Secondary'],
    'B_NEC_res_MIO_SHA_2D-Primary': ['B_N_res_MIO_SHA_2D-Primary','B_E_res_MIO_SHA_2D-Primary','B_C_res_MIO_SHA_2D-Primary'],
    'B_NEC_res_MIO_SHA_2D-Secondary': ['B_N_res_MIO_SHA_2D-Secondary','B_E_res_MIO_SHA_2D-Secondary','B_C_res_MIO_SHA_2D-Secondary'],
    'dB_other': ['dB_other_X', 'dB_other_Y', 'dB_other_Z'],
    'dB_AOCS': ['dB_AOCS_X', 'dB_AOCS_Y', 'dB_AOCS_Z'],
    'dB_Sun': ['dB_Sun_X', 'dB_Sun_Y', 'dB_Sun_Z']
};

// Ordered from highest resolution to lowest with the exception of FAC that 
// needs to be first as the master product needs to be the same
var MASTER_PRIORITY = [
    'SW_OPER_FACATMS_2F', 'SW_OPER_FACBTMS_2F', 'SW_OPER_FACCTMS_2F', 'SW_OPER_FAC_TMS_2F',
    'SW_OPER_EFIA_LP_1B', 'SW_OPER_EFIB_LP_1B', 'SW_OPER_EFIC_LP_1B',
    'SW_OPER_MAGA_LR_1B', 'SW_OPER_MAGB_LR_1B', 'SW_OPER_MAGC_LR_1B',
    'SW_OPER_TECATMS_2F', 'SW_OPER_TECBTMS_2F', 'SW_OPER_TECCTMS_2F',
    'SW_OPER_IBIATMS_2F', 'SW_OPER_IBIBTMS_2F', 'SW_OPER_IBICTMS_2F',
    'SW_OPER_EEFATMS_2F', 'SW_OPER_EEFBTMS_2F', 'SW_OPER_EEFCTMS_2F'
];

function productSortingFunction(a, b) {
    'use strict';
    if (MASTER_PRIORITY.indexOf(a) < MASTER_PRIORITY.indexOf(b)) {
        return -1;
    }
    if (MASTER_PRIORITY.indexOf(a) > MASTER_PRIORITY.indexOf(b)) {
        return 1;
    }
    return 0;
}


(function() {
    'use strict';

    var root = this;

    root.define([
            'backbone',
            'globals',
            'regions/DialogRegion', 'regions/UIRegion',
            'layouts/LayerControlLayout',
            'layouts/ToolControlLayout',
            'layouts/OptionsLayout',
            'core/SplitView/WindowView',
            'communicator',
            'jquery', 'backbone.marionette',
            'controller/ContentController',
            'controller/DownloadController',
            'controller/SelectionManagerController',
            'controller/LoadingController',
            'controller/LayerController',
            'controller/SelectionController',
            'controller/DifferenceController',
            'controller/DataController'
        ],

        function(Backbone, globals, DialogRegion,
            UIRegion, LayerControlLayout, ToolControlLayout, OptionsLayout, WindowView, Communicator) {

        var Application = Backbone.Marionette.Application.extend({
            initialize: function(options) {
            },

            configure: function(config) {


                // Load jquery ui tooltip tool

                /*$(document).ready(function() {
                    $("body").tooltip({ 
                        selector: '[data-toggle=tooltip]',
                        position: { my: "left+5 center", at: "right center" },
                        hide: { effect: false, duration: 0 },
                        show:{ effect: false, delay: 700}
                    });

                });*/

                $("body").tooltip({ 
                    selector: '[data-toggle=tooltip]',
                    position: { my: "left+5 center", at: "right center" },
                    hide: { effect: false, duration: 0 },
                    show:{ effect: false, delay: 700}
                });

                var imagerenderercanvas = $('<canvas/>',{id: 'imagerenderercanvas'});
                $('body').append(imagerenderercanvas);


                var v = {}; //views
                var m = {}; //models
                var t = {}; //templates

                // Application regions are loaded and added to the Marionette Application
                _.each(config.regions, function(region) {
                    var obj = {};
                    obj[region.name] = "#" + region.name;
                    this.addRegions(obj);
                    console.log("Added region " + obj[region.name]);
                }, this);

                //Load all configured views
                _.each(config.views, function(viewDef) {
                    var View = require(viewDef);
                    $.extend(v, View);
                }, this);

                //Load all configured models
                _.each(config.models, function(modelDef) {
                    var Model = require(modelDef);
                    $.extend(m, Model);
                }, this);

                //Load all configured templates
                _.each(config.templates, function(tmplDef) {
                    var Tmpl = require(tmplDef.template);
                    t[tmplDef.id] = Tmpl;
                }, this);

                this.templates = t;
                this.views = v;


                //Map attributes are loaded and added to the global map model
                globals.objects.add('mapmodel', new m.MapModel({
                        visualizationLibs : config.mapConfig.visualizationLibs,
                        center: config.mapConfig.center,
                        zoom: config.mapConfig.zoom,
                        sun: _.has(config.mapConfig, 'showSun') ? config.mapConfig.showSun: true,
                        moon: _.has(config.mapConfig, 'showMoon') ? config.mapConfig.showMoon: true,
                        skyBox: _.has(config.mapConfig, 'showSkyBox') ? config.mapConfig.showSkyBox: true,
                        skyAtmosphere: _.has(config.mapConfig, 'skyAtmosphere') ? config.mapConfig.skyAtmosphere: true,
                        backgroundColor: _.has(config.mapConfig, 'backgroundColor') ? config.mapConfig.backgroundColor: "#000"
                    })
                );


                // Check if version of service is set and if it differs from the
                // current version
                if(localStorage.getItem('serviceVersion') !== null){
                    var serviceVersion = JSON.parse(
                        localStorage.getItem('serviceVersion')
                    );
                    if(serviceVersion!==globals.version){
                        // A new version has been loaded, here we could 
                        // differentiate which version was previous and which
                        // one ist the new, for now we reset and save the new
                        // version
                        showMessage('success',
                            'A new version ('+globals.version+') of the service has been released. '+
                            'Your configuration has been updated.</br>'+
                            'You can find information on the changes in the '+
                            '<b><a target="_blank" href="/accounts/changelog">changelog</a></b>.', 35
                        );
                        localStorage.clear();
                        localStorage.setItem(
                            'serviceVersion',
                            JSON.stringify(globals.version)
                        );
                    }
                } else {
                    // This should be the case when loading version 2.3 for the 
                    // first time (or when the localstorage is empty)
                    localStorage.clear();

                    localStorage.setItem(
                        'serviceVersion',
                        JSON.stringify(globals.version)
                    );
                    
                    showMessage('success',
                        'A new version ('+globals.version+') of the service has been released. '+
                        'Your configuration has been updated.</br>'+
                        'You can find information on the changes in the '+
                        '<b><a target="_blank" href="/accounts/changelog">changelog</a></b>.', 35
                    );
                }


                


                //Base Layers are loaded and added to the global collection
                // If there are already saved baselayer config in the local
                // storage use that instead

                if(localStorage.getItem('baseLayersConfig') !== null){
                    // If newly added v2.1 s2 cloudless is not listed 
                    // reload baselayer config
                    var savedConfig = JSON.parse(localStorage.getItem('baseLayersConfig'));
                    if(savedConfig.filter(function(bl){
                        return bl.views[0].id === 's2cloudless';
                    }).length===0){
                        savedConfig = config.mapConfig.baseLayers;
                    }
                    config.mapConfig.baseLayers = savedConfig;
                }

                _.each(config.mapConfig.baseLayers, function(baselayer) {

                    globals.baseLayers.add(
                        new m.LayerModel({
                            name: baselayer.name,
                            visible: baselayer.visible,
                            view: {
                                id : baselayer.id,
                                urls : baselayer.urls,
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
                    console.log("Added baselayer " + baselayer.id );
                }, this);
                
                var autoColor = {
                    colors : d3.scale.category10(),
                    index : 0,
                    getColor: function () { return this.colors(this.index++) }
                }


                //Productsare loaded and added to the global collection
                var ordinal = 0;
                var domain = [];
                var range = [];

                // Remove three first colors as they are used by the products
                autoColor.getColor();autoColor.getColor();autoColor.getColor();

                // If there are already saved product config in the local
                // storage use that instead

                if(localStorage.getItem('productsConfig') !== null){
                    // Need to check if we need to migrate user data to new version (new data)
                    var product_config = JSON.parse(localStorage.getItem('productsConfig'));

                    // Go through products in original configuration file and see if available
                    // in user configuration, if not add them to it
                    var m_p = config.mapConfig.products;
                    for (var i = 0; i < m_p.length; i++) {

                        // Always load timesliderprotocol from original config
                        if(m_p[i].hasOwnProperty('timeSliderProtocol')){
                            product_config[i].timeSliderProtocol = m_p[i].timeSliderProtocol;
                        }

                        // Check if MAG A product has new residual parameter loaded
                        if(product_config[i].download.id === 'SW_OPER_MAGA_LR_1B'){
                            if(!product_config[i].parameters.hasOwnProperty('B_NEC_resAC')){
                                product_config[i].parameters.B_NEC_resAC = 
                                {
                                    'range': [-600, 600],
                                    'uom':'nT',
                                    'colorscale': 'jet',
                                    'name': 'Magnetic field intensity residual A - C'
                                };
                            }
                        }
                        
                        // If old CHAOS model is available load new model
                        if(product_config[i].name === 'CHAOS-5'){
                            // Make sure corresponding config is new model
                            if(m_p[i].name === 'CHAOS-6'){
                                product_config[i] = m_p[i];
                            }
                        }


                        if(product_config.length>i){
                            if(product_config[i].download.id != m_p[i].download.id){
                                // If id is not the same a new product was inserted and thus 
                                // needs to be inserted into the old configuration of the user
                                product_config.splice(i, 0, m_p[i]);
                            }
                        }else{
                            // If length of config is longer then user config new data was apended
                            product_config.push(m_p[i]);
                        }
                    }

                    config.mapConfig.products = product_config;
                }

                // Make sure download parameters are always loaded from script
                var mapConfProds = config.mapConfig.products;
                for (var i = mapConfProds.length - 1; i >= 0; i--) {
                    if(mapConfProds[i].hasOwnProperty('satellite') && 
                       mapConfProds[i].satellite === 'Swarm') {

                        mapConfProds[i].download_parameters['SunDeclination'] = {
                            "uom": null,
                            "name": "Sun declination"
                        };
                        mapConfProds[i].download_parameters['SunRightAscension'] = {
                            "uom": null,
                            "name": "Sun right ascension"
                        };
                        mapConfProds[i].download_parameters['SunHourAngle'] = {
                            "uom": "deg",
                            "name": "Sun hour angle"
                        };
                        mapConfProds[i].download_parameters['SunAzimuthAngle'] = {
                            "uom": "deg",
                            "name": "Sun azimuth angle, degrees clockwise from North"
                        };
                        mapConfProds[i].download_parameters['SunZenithAngle'] = {
                            "uom": "deg",
                            "name": "Sun zenith angle"
                        };
                        mapConfProds[i].download_parameters['OrbitDirection'] = {
                            "uom": null,
                            "name": "Orbit direction in geographic coodinates."
                        };
                        mapConfProds[i].download_parameters['QDOrbitDirection'] = {
                            "uom": null,
                            "name": "Orbit direction in quasi-dipole coodinates."
                        };
                    }
                }

                _.each(config.mapConfig.products, function(product) {
                    var p_color = product.color ? product.color : autoColor.getColor();
                    var lm = new m.LayerModel({
                        name: product.name,
                        visible: product.visible,
                        ordinal: ordinal,
                        timeSlider: product.timeSlider,
                        // Default to WMS if no protocol is defined
                        timeSliderProtocol: (product.timeSliderProtocol) ? product.timeSliderProtocol : "WMS",
                        color: p_color,
                        //time: products.time, // Is set in TimeSliderView on time change.
                        opacity: (product.opacity) ? product.opacity : 1,
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
                        sign: defaultFor(product.sign, "+"),
                        selectedComposed: defaultFor(product.selectedComposed, false),
                        coefficients_range: product.coefficients_range,
                        satellite: product.satellite,
                        tileSize: (product.tileSize) ? product.tileSize : 256,
                        validity: product.validity,
                        showColorscale: true
                    });

                    if(product.hasOwnProperty('differenceTo')){
                        lm.set('differenceTo', product.differenceTo);
                    }

                    if(lm.get('model')){
                        // register magnetic model
                        globals.models.add({name: lm.get('download').id});
                        lm.set('contours', defaultFor( product.contours,false));
                        lm.set('differenceTo', defaultFor( 
                            product.differenceTo, null)
                        );
                    }

                    if(lm.get('download').id === 'Custom_Model'){
                        globals.models.customModelId = 'Custom_Model';
                        var shcFile = localStorage.getItem('shcFile');
                        if(shcFile !== null){
                            shcFile = JSON.parse(shcFile);
                            lm.set('shc', shcFile.data);
                            lm.set('shc_name', shcFile.name);
                            globals.models.get(lm.get('download').id).set({
                              'shc': shcFile.data,
                              'shc_name': shcFile.name
                            });
                        }
                    }
                    
                    if(lm.get('download').id === 'Magnetic_Model'){
                      globals.models.composedModelId = 'Magnetic_Model';
                        lm.set('model_expression', defaultFor(product.model_expression,null));
                        globals.models.get(lm.get('download').id).set({
                          'model_expression': lm.get("model_expression")
                        });

                        var shcFile = localStorage.getItem('shcFile');
                        if(shcFile !== null){
                            shcFile = JSON.parse(shcFile);
                            lm.set('shc', shcFile.data);
                            lm.set('shc_name', shcFile.name);
                            globals.models.get(lm.get('download').id).set({
                              'shc': shcFile.data,
                              'shc_name': shcFile.name
                            });
                        }
                    }
                    
                    globals.products.add(lm);

                    if(product.processes){
                        domain.push(product.processes[0].layer_id);
                        range.push(p_color);
                    }
                    
                    console.log("Added product " + product.name );
                }, this);

                var productcolors = d3.scale.ordinal().domain(domain).range(range);

                globals.objects.add('productcolors', productcolors);

                // periodic update magnetic models' metadata
                globals.models.url = config.magneticModels.infoUrl;
                globals.models.on('fetch:success', function () {
                  // put default coefficients from server response as new config if products have -1,-1
                  _.each(this.models, function(model){
                    var modelExpressionFromProducts = globals.products.find(function(p){
                      return p.get("download").id === model.get("name");
                    });
                    
                    var productCoefficients = modelExpressionFromProducts.get("coefficients_range");
                    if (productCoefficients && productCoefficients[0] === -1 && productCoefficients[1] === -1){
                      modelExpressionFromProducts.set("coefficients_range", model.get("coefficients_range"));
                    }
                  })
                  if (this.customModelId && !this.get(this.customModelId))
                  {
                    this.add({name: this.customModelId});
                  }
                  if (this.composedModelId && !this.get(this.composedModelId))
                  {
                    this.add({name: this.composedModelId});
                    var modelExpressionFromProducts = globals.products.find(function(p){
                      return p.get("download").id === "Magnetic_Model";
                    });
                    this.get("Magnetic_Model").set({
                      'model_expression': modelExpressionFromProducts.get("model_expression")
                    })
                  }
                  
                  Communicator.mediator.trigger('models:update');
                });

                // TODO: There is one initial request where sending is not counted
                // but the ajax response is. This sets the event counter negative
                // for now i add the event change here but i am not sure which 
                // request is actually responsible for this
                Communicator.mediator.trigger("progress:change", true);
                //globals.models.on('fetch:start', function () {
                //});

                globals.models.fetch();
                window.setInterval(function () {globals.models.fetch();}, 900000); // refresh each 15min


                // If there is already saved overly configuration use that
                if(localStorage.getItem('overlaysConfig') !== null){
                    config.mapConfig.overlays = JSON.parse(localStorage.getItem('overlaysConfig'));
                }
                //Overlays are loaded and added to the global collection
                _.each(config.mapConfig.overlays, function(overlay) {

                        globals.overlays.add(
                            new m.LayerModel({
                                name: overlay.name,
                                visible: overlay.visible,
                                ordinal: ordinal,
                                view: overlay.view
                            })
                        );
                        console.log("Added overlay " + overlay.id);
                    }, this);


                // If Navigation Bar is set in configuration go trhough the 
                // defined elements creating a item collection to rendered
                // by the marionette collection view
                if (config.navBarConfig) {

                    var addNavBarItems = defaultFor(self.NAVBARITEMS, []);
                    config.navBarConfig.items = config.navBarConfig.items.concat(addNavBarItems);
                    var navBarItemCollection = new m.NavBarCollection;

                    _.each(config.navBarConfig.items, function(list_item){
                        navBarItemCollection.add(
                            new m.NavBarItemModel(list_item)
                        );
                    }, this);

                    this.topBar.show(new v.NavBarCollectionView(
                        {template: t.NavBar({
                            title: config.navBarConfig.title,
                            url: config.navBarConfig.url}),
                        className:"navbar navbar-inverse navbar-fixed-top not-selectable",
                        itemView: v.NavBarItemView, tag: "div",
                        collection: navBarItemCollection}));

                };

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
                    collection:globals.baseLayers,
                    itemView: v.LayerItemView.extend({
                        template: {
                            type:'handlebars',
                            template: t.BulletLayer},
                        className: "radio-inline"
                    })
                });

        // We want to have the full list of products as the underlying
                // system works in this manner but in order to accomodate the 
                // concept of one product with three satellites we remove here 
                // Each three products and combine them to one, the logic for
                // "separating" them is then done when activating one of this
                // "special products"

          var filtered = globals.products.filter(function (m) {
                    if (m && m.get("download").id && 
                         (
                            m.get("download").id.indexOf("SW_OPER_MAG") != -1 ||
                            m.get("download").id.indexOf("SW_OPER_EFI") != -1 ||
                            m.get("download").id.indexOf("SW_OPER_IBI") != -1 ||
                            m.get("download").id.indexOf("SW_OPER_TEC") != -1 ||
                            m.get("download").id.indexOf("SW_OPER_FAC") != -1 ||
                            m.get("download").id.indexOf("SW_OPER_EEF") != -1 ||
                            m.get('model') && !["Magnetic_Model"].includes(m.get('download').id)
                         )
                    ){
                        return false;
                    }else{
                        return true;
                    }
                });

                globals.swarm["satellites"] = {
                    "Alpha": true,
                    "Bravo": false,
                    "Charlie": false,
                    "NSC": false
                };

                if(localStorage.getItem("satelliteSelection") !== null){
                    globals.swarm.satellites = JSON.parse(localStorage.getItem("satelliteSelection"));
                    if(!globals.swarm.satellites.hasOwnProperty("NSC")){
                        globals.swarm.satellites['NSC'] = false;
                    }
                }

                globals.swarm["products"] = {
                    "MAG": {
                        "Alpha": "SW_OPER_MAGA_LR_1B",
                        "Bravo": "SW_OPER_MAGB_LR_1B",
                        "Charlie": "SW_OPER_MAGC_LR_1B"
                    },
                    "EFI":  {
                        "Alpha": "SW_OPER_EFIA_LP_1B",
                        "Bravo": "SW_OPER_EFIB_LP_1B",
                        "Charlie": "SW_OPER_EFIC_LP_1B"
                    },
                    "IBI":  {
                        "Alpha": "SW_OPER_IBIATMS_2F",
                        "Bravo": "SW_OPER_IBIBTMS_2F",
                        "Charlie": "SW_OPER_IBICTMS_2F"
                    },
                    "TEC":  {
                        "Alpha": "SW_OPER_TECATMS_2F",
                        "Bravo": "SW_OPER_TECBTMS_2F",
                        "Charlie": "SW_OPER_TECCTMS_2F"
                    },
                    "FAC":  {
                        "Alpha": "SW_OPER_FACATMS_2F",
                        "Bravo": "SW_OPER_FACBTMS_2F",
                        "Charlie": "SW_OPER_FACCTMS_2F",
                        "NSC": "SW_OPER_FAC_TMS_2F"
                    },
                    "EEF":  {
                        "Alpha": "SW_OPER_EEFATMS_2F",
                        "Bravo": "SW_OPER_EEFBTMS_2F"
                    }
                };

                globals.swarm["activeProducts"] = [];
                
                var filtered_collection = new Backbone.Collection(filtered);

                var containerSelection = {
                    'MAG': true,
                    'EFI': false,
                    'IBI': false,
                    'TEC': false,
                    'FAC': false,
                    'EEF': false
                };

                var clickEvent = "require(['communicator'], function(Communicator){Communicator.mediator.trigger('application:reset');});";

                if(localStorage.getItem("containerSelection") !== null){
                    containerSelection = JSON.parse(localStorage.getItem("containerSelection"));

                    // Migration to newly available datasets
                    if (!containerSelection.hasOwnProperty('TEC')){
                        containerSelection.TEC = false;
                    }
                    if (!containerSelection.hasOwnProperty('FAC')){
                        containerSelection.FAC = false;
                    }
                    if (!containerSelection.hasOwnProperty('EEF')){
                        containerSelection.EEF = false;
                    }


                    showMessage('success',
                     'The configuration of your last visit has been loaded, '+
                     'if you would like to reset to the default configuration click '+
                     '<b><a href="javascript:void(0);" onclick="'+clickEvent+'">here</a></b> '+
                     'or on the Reset button above.', 35);

                    // Chech if succesfull login info is being shown, if yes, 
                    // add padding to not overlap messages
                    if($('.alert.alert-success.fade.in').length>0){
                        $('.alert.alert-success.fade.in').css('margin-top', '100px');
                    }
                }else{
                    localStorage.setItem("containerSelection", JSON.stringify(containerSelection));
                }

                var csKeys = _.keys(containerSelection);
                for (var i = csKeys.length - 1; i >= 0; i--) {
                    if(containerSelection[csKeys[i]]){
                        var satKeys = _.keys(globals.swarm.products[csKeys[i]]);
                        for (var j = satKeys.length - 1; j >= 0; j--) {
                            if(globals.swarm.satellites[satKeys[j]]){
                                globals.swarm.activeProducts.push(
                                    globals.swarm.products[csKeys[i]][satKeys[j]]
                                );
                            }
                        }
                    }
                }

                for (var i = globals.swarm.activeProducts.length - 1; i >= 0; i--) {
                    globals.products.forEach(function(p){
                        if(p.get("download").id == globals.swarm.activeProducts[i]){
                            if(!p.get("visible")){
                                p.set("visible", true);
                            }
                        }
                    });
                }



            // Add generic product (which is container for A,B and C sats)
            filtered_collection.add({
                    name: "Equatorial electric field (EEF)",
                    visible: containerSelection['EEF'],
                    color: "#b82e2e",
                    protocol: null,
                    containerproduct: true,
                    id: "EEF"
                }, {at: 0});
                filtered_collection.add({
                    name: "Electric current data (FAC)",
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
                    name: "Bubble Index data (IBI)",
                    visible: containerSelection['IBI'],
                    color: "#2ca02c",
                    protocol: null,
                    containerproduct: true,
                    id: "IBI"
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
                


                this.productsView = new v.LayerSelectionView({
                    collection: filtered_collection,
                    itemView: v.LayerItemView.extend({
                        template: {
                            type:'handlebars',
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
                _.each(config.selectionTools, function(selTool) {
                    selectionToolsCollection.add(
                            new m.ToolModel({
                                id: selTool.id,
                                description: selTool.description,
                                icon:selTool.icon,
                                enabled: true,
                                active: false,
                                type: "selection",
                                selectionType: selTool.selectionType
                            }));
                }, this);

                // Define collection of visualization tools
                var visualizationToolsCollection = new m.ToolCollection();
                _.each(config.visualizationTools, function(visTool) {
                    visualizationToolsCollection.add(
                            new m.ToolModel({
                                id: visTool.id,
                                eventToRaise: visTool.eventToRaise,
                                description: visTool.description,
                                disabledDescription: visTool.disabledDescription,
                                icon:visTool.icon,
                                enabled: visTool.enabled,
                                active: visTool.active,
                                type: "tool"
                            }));
                }, this);

                // Define collection of visualization modes
                var visualizationModesCollection = new m.ToolCollection();
                _.each(config.visualizationModes, function(visMode) {
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
                    collection:visualizationToolsCollection,
                    itemView: v.ToolItemView.extend({
                        template: {
                            type:'handlebars',
                            template: t.ToolIcon}
                    })
                });

                // Create Collection Views to hold set of views for visualization tools
                this.selectionToolsView = new v.ToolSelectionView({
                    collection:selectionToolsCollection,
                    itemView: v.ToolItemView.extend({
                        template: {
                            type:'handlebars',
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

                var compare = function(val){
                    return val <= this[1] && val >= this[0];
                };

                // Load possible available filter selection
                if(localStorage.getItem('filterSelection') !== null){
                    var filters = JSON.parse(localStorage.getItem('filterSelection'));
                    var filterfunc = {};
                    for (var f in filters){
                        var ext = filters[f];
                        filterfunc[f] = compare.bind(ext);
                    }
                    globals.swarm.set('filters', filterfunc);
                    Communicator.mediator.trigger('analytics:set:filter', filters);
                    //globals.swarm.set('filters', JSON.parse(localStorage.getItem('filterSelection')));
                }

                


            },

            // The GUI is setup after the application is started. Therefore all modules
            // are already registered and can be requested to populate the GUI.
            setupGui: function() {

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

                if ( (typeof(Storage) !== "undefined") && localStorage.getItem("viewSelection") !== null) {
                    if(localStorage.getItem('viewSelection') == 'split'){
                        splitview.setSplitscreen();
                    }
                    if(localStorage.getItem('viewSelection') == 'globe'){
                        splitview.setSinglescreen('CesiumViewer');
                    }
                    if( localStorage.getItem('viewSelection') == 'analytics'){
                        splitview.setSinglescreen('AVViewer');
                    }
                }else{
                    splitview.setSplitscreen();
                }

                // Try to get CSRF token, if available set it for necesary ajax requests
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

                if(csrftoken){
                    $.ajaxSetup({
                        beforeSend: function(xhr, settings) {
                            if (!csrfSafeMethod(settings.type) && !this.crossDomain) {
                                xhr.setRequestHeader("X-CSRFToken", csrftoken);
                            }
                        }
                    });
                }

                // Add a trigger for ajax calls in order to display loading state
          // in mouse cursor to give feedback to the user the client is busy
          $(document).ajaxStart(function() {
                Communicator.mediator.trigger("progress:change", true);
          });

          $(document).ajaxStop(function() {
                Communicator.mediator.trigger("progress:change", false);
          });

          $(document).ajaxError(function( event, request , settings, thrownError ) {
            if(settings.suppressErrors) {
                return;
            }
            var error_text = request.responseText.match("<ows:ExceptionText>(.*)</ows:ExceptionText>");

            if (error_text && error_text.length > 1) {
                error_text = error_text[1];
            } else {
                error_text = 'Please contact feedback@vires.services if issue persists.'
            }

            showMessage('danger', ('Problem retrieving data: ' + error_text), 35);
          });

          $('.tab-header:contains(Download)').css( "font-weight", "bold" );

          // The tooltip is called twice at beginning and end, it seems to show the style of the
          // tooltips more consistently, there is some problem where sometimes no style is shown for tooltips
          $("body").tooltip({ 
                    selector: '[data-toggle=tooltip]',
                    position: { my: "left+5 center", at: "right center" },
                    hide: { effect: false, duration: 0 },
                    show:{ effect: false, delay: 700}
                });

              // Now that products and data are loaded make sure datacontroller is correctly initialized
                Communicator.mediator.trigger('manual:init');
                this.timeSliderView.manualInit();

                // Broadcast possible area selection
                if(localStorage.getItem('areaSelection') !== null){
                    Communicator.mediator.trigger('selection:changed', JSON.parse(localStorage.getItem('areaSelection')));
                }

                Communicator.mediator.trigger('map:multilayer:change', globals.swarm.activeProducts);

                // Remove loading screen when this point is reached in the script
                $('#loadscreen').remove();


            }

        });

        return new Application();
    });
}).call( this );
