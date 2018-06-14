(function() {
    'use strict';

    var root = this;

    root.require.config({
        waitSeconds: 120,
        /* starting point for application */
        deps: ['backbone', 'backbone.marionette', 'bootstrap', 'marionette.handlebars', 'main'],

        shim: {
            jqueryui: {
                deps:['jquery']
            },
            jqueryuitouch: {
                deps:['jqueryui']
            },
            handlebars: {
                exports: 'Handlebars'
            },

            backbone: {
                deps: [
                    'underscore',
                    'jquery'
                ],
                exports: 'Backbone'
            },
            bootstrap: {
                deps: ['jquery'],
                exports: 'jquery'
            },
            libcoverage: {
                deps: ['backbone']/*,
                exports: 'WCS'*/
            },
            FileSaver: {
                deps: ['canvas-toBlob', 'Blob'],
                exports: 'saveAs'
            },
            lm:{
                exports: 'lm'
            },
            timeslider: {
                deps: ['d3']
            },
            keypress: {
                exports: 'Keypress'
            },
            xtk: {
                exports: 'X'
            },
            'xtk-gui': {
                exports: 'dat'
            },
            drawhelper: {
                deps: ['cesium/Cesium'],
                exports: 'DrawHelper'
            },
            analytics: {
                deps: ['d3', 'jquery', 'w2ui', 'sumoselect']
            },
            w2ui: {
                deps: ['jquery']
            },
            w2popup: {
                deps: ['w2utils', 'jquery']
            },
            graphly: {
                deps: ['d3', 'plotty', 'msgpack']
            },
            
        },

        paths: {
            analytics: '../bower_components/d3.Graphs/lib/scripts/av.min',
            msgpack: '../bower_components/msgpack-lite/dist/msgpack.min',
            graphly: '../bower_components/graphly/dist/graphly.min',
            cesium: "../bower_components/cesium/Build/Cesium",
            drawhelper: "../scripts/vendor/cesium_DrawHelper",
            contrib: 'contrib',
            core: 'core',
            requirejs: '../bower_components/requirejs/require',
            jquery: '../bower_components/jquery/jquery.min',
            jqueryui: '../bower_components/jquery-ui/ui/minified/jquery-ui.min',
            jqueryuitouch: '../bower_components/jqueryui-touch-punch/jquery.ui.touch-punch.min',
            backbone: '../bower_components/backbone-amd/backbone-min',
            underscore: '../bower_components/underscore-amd/underscore-min',
            d3: '../bower_components/d3/d3.min',
            timeslider: '../bower_components/d3.TimeSlider/d3.timeslider.min',
            libcoverage: '../bower_components/libcoverage/libcoverage.min',

            'canvas-toBlob': '../bower_components/canvas-toBlob.js/canvas-toBlob',
            'Blob': '../bower_components/Blob.js/Blob',
            'FileSaver': '../bower_components/FileSaver.js/FileSaver',

            lm: '../bower_components/lm.js/lm',

            /* alias all marionette libs */
            'backbone.marionette': '../bower_components/backbone.marionette/lib/core/amd/backbone.marionette.min',
            'backbone.wreqr': '../bower_components/backbone.wreqr/lib/amd/backbone.wreqr.min', 
            'backbone.babysitter': '../bower_components/backbone.babysitter/lib/amd/backbone.babysitter.min',

            /* alias the bootstrap js lib */
            bootstrap: '../bower_components/bootstrap/dist/js/bootstrap.min',

            /* Alias text.js for template loading and shortcut the templates dir to tmpl */
            text: '../bower_components/requirejs-text/text',
            tmpl: "../templates",

            /* handlebars from the require handlerbars plugin below */
            handlebars: '../bower_components/require-handlebars-plugin/Handlebars',

            /* require handlebars plugin - Alex Sexton */
            i18nprecompile: '../bower_components/require-handlebars-plugin/hbs/i18nprecompile',
            json2: '../bower_components/require-handlebars-plugin/hbs/json2',
            hbs: '../bower_components/require-handlebars-plugin/hbs',

            /* marionette and handlebars plugin */
            'marionette.handlebars': '../bower_components/backbone.marionette.handlebars/backbone.marionette.handlebars.min',


            keypress: '../bower_components/Keypress/keypress',

            papaparse: '../bower_components/papaparse/papaparse.min',

            plotty: '../bower_components/plotty/dist/plotty.min',

            sumoselect: '../bower_components/sumoselect/jquery.sumoselect.min',

            w2ui: '../bower_components/w2ui/dist/w2ui-fields.min',
            w2popup: '../bower_components/w2ui/src/w2popup',
            w2utils: '../bower_components/w2ui/src/w2utils'

        },

        hbs: {
            disableI18n: true
        }
    });
}).call( this );