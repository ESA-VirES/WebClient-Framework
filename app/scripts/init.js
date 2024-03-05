(function () {
    'use strict';

    var root = this;

    root.require.config({
        urlArgs: 'bust=v3.13.1',

        waitSeconds: 120,
        /* starting point for application */
        deps: ['backbone', 'backbone.marionette', 'bootstrap', 'marionette.handlebars', 'main'],

        shim: {
            jqueryui: {
                deps: ['jquery']
            },
            jqueryuitouch: {
                deps: ['jqueryui']
            },
            handlebars: {
                exports: 'Handlebars'
            },
            filepond: {
                exports: 'FilePond',
                deps: ['jquery']
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
            timeslider: {
                deps: ['d3']
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
            plotty: {
                exports: 'plotty'
            }

        },

        paths: {
            filepond: '../filepond/dist/filepond.min',
            analytics: '../d3.Graphs/lib/scripts/av.min',
            msgpack: '../msgpack-lite/dist/msgpack.min',
            cesium: "../cesium/Build/Cesium",
            drawhelper: "../scripts/vendor/cesium_DrawHelper",
            contrib: 'contrib',
            core: 'core',
            requirejs: '../requirejs/require',
            jquery: '../jquery/jquery.min',
            jqueryui: '../jquery-ui/ui/minified/jquery-ui.min',
            jqueryuitouch: '../jqueryui-touch-punch/jquery.ui.touch-punch.min',
            backbone: '../backbone-amd/backbone-min',
            underscore: '../underscore-amd/underscore-min',
            choices: '../choices.js/assets/scripts/dist/choices.min',
            d3: '../d3/d3.min',
            timeslider: '../d3.TimeSlider/d3.timeslider.min',
            libcoverage: '../libcoverage/libcoverage.min',

            'FileSaver': '../FileSaver.js/FileSaver',

            /* alias all marionette libs */
            'backbone.marionette': '../backbone.marionette/lib/core/amd/backbone.marionette.min',
            'backbone.wreqr': '../backbone.wreqr/lib/amd/backbone.wreqr.min',
            'backbone.babysitter': '../backbone.babysitter/lib/amd/backbone.babysitter.min',

            /* alias the bootstrap js lib */
            bootstrap: '../bootstrap/dist/js/bootstrap.min',

            /* Alias text.js for template loading and shortcut the templates dir to tmpl */
            text: '../requirejs-text/text',
            tmpl: "../templates",

            /* handlebars from the require handlerbars plugin below */
            handlebars: '../require-handlebars-plugin/Handlebars',

            /* require handlebars plugin - Alex Sexton */
            i18nprecompile: '../require-handlebars-plugin/hbs/i18nprecompile',
            json2: '../require-handlebars-plugin/hbs/json2',
            hbs: '../require-handlebars-plugin/hbs',

            /* marionette and handlebars plugin */
            'marionette.handlebars': '../backbone.marionette.handlebars/backbone.marionette.handlebars.min',

            papaparse: '../papaparse/papaparse.min',

            plotty: '../plotty/dist/plotty.min',

            sumoselect: '../sumoselect/jquery.sumoselect.min',

            w2ui: '../w2ui/dist/w2ui-fields.min',
            w2popup: '../w2ui/src/w2popup',
            w2utils: '../w2ui/src/w2utils',
            graphly: '../graphly/dist/graphly.min'

        },

        hbs: {
            disableI18n: true
        }
    });
}).call(this);
