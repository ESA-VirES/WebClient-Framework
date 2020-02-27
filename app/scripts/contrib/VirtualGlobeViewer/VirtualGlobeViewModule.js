define([
    'backbone.marionette',
    'app',
    'communicator',
    './VirtualGlobeViewController',
    './VirtualGlobeViewRouter'
], function(Marionette, App, Communicator, VirtualGlobeViewController, VirtualGlobeViewRouter) {

    'use strict';

    App.module('VirtualGlobeViewer', function(Module) {

        // Disabled module for now as it is not needed
        this.startsWithParent = false;

        // I like the idea of a 'module' that holds together the controllers and
        // views. The module-controller-view concept allows to delegate the responsibilities of
        // each component clearly. E.g. the module only communicates with the App and the
        // Communicator object. A controller only talks to its module and to its views. A view
        // is connected only to its controller via events. No other communication is allowed,
        // i.e. a controller is not allowed to directly talk to the Communicator.
        this.on('start', function(options) {
            this.instances = {};
            this.idx = 0;

            console.log('[VirtualGlobeViewer] Finished module initialization');
        });

        this.createController = function(opts) {
            var id = undefined;
            var startPosition = undefined;

            if (typeof opts !== 'undefined') {
                id = opts.id;
                startPosition = opts.startPosition;

            } else {
                startPosition = {
                    center: [15, 47],
                    distance: 2400000,
                    duration: 100,
                    tilt: 40
                };
            }

            // This is a debug start position at level_0:
            // startPosition = {
            //     center: [0, 0],
            //     distance: 5000000,
            //     duration: 1,
            //     tilt: 0
            // }

            // Go through instances and return first free one
            for (var contr in this.instances) {
                if (!this.instances[contr].isActive()) {
                    console.log('Free globe viewer returned ' + contr);
                    return this.instances[contr];
                }
            };

            // If there are no free insances create a new one
            if (typeof id === 'undefined') {
                id = 'VirtualGlobeViewer.' + this.idx++;
            }

            var controller = new VirtualGlobeViewController({
                id: id,
                startPosition: startPosition
            });
            this.instances[id] = controller;

            setupKeyboardShortcuts(controller);

            return controller;
        };

        var setupKeyboardShortcuts = function(controller) {
        };
    });
});