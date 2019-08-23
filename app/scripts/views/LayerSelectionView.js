/* globals $ */
(function () {
    'use strict';
    var root = this;

    root.define([
        'backbone',
        'communicator',
        'globals',
        'underscore'
    ], function (Backbone, Communicator, globals) {

        var LayerSelectionView = Backbone.Marionette.CollectionView.extend({

            tagName: "ul",

            initialize: function (options) {
                // Initially tell the models in the collection, which layer ordinal they have:
                var idx = 0;

                this.collection.forEach(function (model) {
                    model.set('ordinal', idx++);
                    // console.log('[LayerSeleectionView::initialize] layer: ' + model.get('view').id + ' / ordinal: ' + model.get('ordinal'));
                });
            },

            onShow: function (view) {

                this.listenTo(Communicator.mediator, "productCollection:updateSort", this.updateSort);
                this.listenTo(Communicator.mediator, "map:layer:change", this.onLayerSelectionChange);

                $(".sortable").sortable({
                    revert: true,
                    stop: function (event, ui) {
                        ui.item.trigger('drop', ui.item.index());
                    }
                });

                $('#alphacheck').prop('checked', globals.swarm.satellites["Alpha"]);
                $('#bravocheck').prop('checked', globals.swarm.satellites["Bravo"]);
                $('#charliecheck').prop('checked', globals.swarm.satellites["Charlie"]);
                $('#nsccheck').prop('checked', globals.swarm.satellites["NSC"]);
                $('#uploadcheck').attr('disabled', globals.userData.models.length === 0);
                $('#uploadcheck').prop('checked', globals.swarm.satellites["Upload"]);

                $('#alphacheck').change(function (evt) {
                    globals.swarm.satellites['Alpha'] = $('#alphacheck').is(':checked');
                    Communicator.mediator.trigger('layers:refresh');
                });
                $('#bravocheck').change(function (evt) {
                    globals.swarm.satellites['Bravo'] = $('#bravocheck').is(':checked');
                    Communicator.mediator.trigger('layers:refresh');
                });
                $('#charliecheck').change(function (evt) {
                    globals.swarm.satellites["Charlie"] = $('#charliecheck').is(':checked');
                    Communicator.mediator.trigger('layers:refresh');
                });
                $('#nsccheck').change(function (evt) {
                    globals.swarm.satellites["NSC"] = $('#nsccheck').is(':checked');
                    Communicator.mediator.trigger('layers:refresh');
                });
                $('#uploadcheck').change(function (evt) {
                    globals.swarm.satellites["Upload"] = $('#uploadcheck').is(':checked');
                    Communicator.mediator.trigger('layers:refresh');
                });
            },

            updateSort: function (options) {
                var previousPos = options.model.get('ordinal');
                var shifts = {};
                this.collection.remove(options.model);

                // Count special container collections
                var specialColl = this.collection.filter(function (m) {return m.get("containerproduct");});
                options.position = options.position + specialColl.length;

                this.collection.each(function (model, index) {
                    var ordinal = index;
                    if (index >= options.position) {
                        ordinal += 1;
                    }
                    model.set('ordinal', ordinal);
                });

                shifts[options.model.get('name')] = previousPos - options.position;
                options.model.set('ordinal', options.position);
                this.collection.add(options.model, {at: options.position});

                this.render();

                Communicator.mediator.trigger("productCollection:sortUpdated", shifts);
            },

            onLayerSelectionChange: function (options) {
                if (options.isBaseLayer) {
                    globals.baseLayers.forEach(function (model, index) {
                        model.set("visible", false);
                    });
                    globals.baseLayers.find(function (model) {return model.get('name') == options.name;}).set("visible", true);
                } else {
                    var product = globals.products.find(function (model) {return model.get('name') == options.name;});
                    if (product) {
                        product.set("visible", options.visible);
                    } else {
                        globals.overlays.find(function (model) {return model.get('name') == options.name;}).set("visible", options.visible);
                    }
                }
            },
        });

        return {'LayerSelectionView': LayerSelectionView};
    });

}).call(this);
