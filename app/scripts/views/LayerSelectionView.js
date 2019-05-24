(function() {
    'use strict';

    var root = this;

    root.define([
        'backbone',
        'communicator',
        'globals',
        'underscore'
    ],

    function( Backbone, Communicator, globals ) {

        var LayerSelectionView = Backbone.Marionette.CollectionView.extend({

            tagName: "ul",

            initialize: function(options) {
                // Initially tell the models in the collection, which layer ordinal they have:
                var idx = 0;

                this.collection.forEach(function(model) {
                    model.set('ordinal', idx++);
                    // console.log('[LayerSeleectionView::initialize] layer: ' + model.get('view').id + ' / ordinal: ' + model.get('ordinal'));
                });
            },

            onShow: function(view){

                var self = this;

                this.listenTo(Communicator.mediator, "productCollection:updateSort", this.updateSort);
                this.listenTo(Communicator.mediator, "map:layer:change", this.onLayerSelectionChange);


                $( ".sortable" ).sortable({
                    revert: true,

                    stop: function(event, ui) {
                        ui.item.trigger('drop', ui.item.index());
                    }
                });

                $('#alphacheck').prop('checked', globals.swarm.satellites["Alpha"]);
                $('#bravocheck').prop('checked', globals.swarm.satellites["Bravo"]);
                $('#charliecheck').prop('checked', globals.swarm.satellites["Charlie"]);
                $('#nsccheck').prop('checked', globals.swarm.satellites["NSC"]);
                $('#uploadcheck').attr('disabled', globals.userData.models.length === 0);
                $('#uploadcheck').prop('checked', globals.swarm.satellites["Upload"]);

                $('#alphacheck').change(function(evt){
                    self.checkMultiProduct();
                });
                $('#bravocheck').change(function(evt){
                    self.checkMultiProduct();
                });
                $('#charliecheck').change(function(evt){
                    self.checkMultiProduct();
                });
                $('#nsccheck').change(function(evt){
                    self.checkMultiProduct();
                });
                $('#uploadcheck').change(function(evt) {
                  globals.swarm.satellites["Upload"] = $('#uploadcheck').is(':checked');
                    self.checkMultiProduct();
                });
            },

            checkMultiProduct: function(){
                var that = this;

                for (var i = globals.swarm.activeProducts.length - 1; i >= 0; i--) {
                    globals.products.forEach(function(p){
                        if(p.get("download").id == globals.swarm.activeProducts[i]){
                            if(p.get("visible")){
                                p.set("visible", false);
                                Communicator.mediator.trigger('map:layer:change', {
                                    name: p.get("name"),
                                    isBaseLayer: false,
                                    visible: false
                                });
                            }
                        }
                    });
                }

                globals.swarm.activeProducts = [];

                this.collection.forEach(function(p){

                    if(p.get("containerproduct")){

                        if(p.get("visible")){

                            if($('#alphacheck').is(':checked')){
                                if(globals.swarm.activeProducts.indexOf(globals.swarm.products[p.get('id')]['Alpha']) === -1){
                                    globals.swarm.activeProducts.push(globals.swarm.products[p.get('id')]['Alpha']);
                                }
                            }

                            if ($('#bravocheck').is(':checked')){
                                if(globals.swarm.activeProducts.indexOf(globals.swarm.products[p.get('id')]['Bravo']) === -1){
                                    globals.swarm.activeProducts.push(globals.swarm.products[p.get('id')]['Bravo']);
                                }
                            }

                            if($('#charliecheck').is(':checked')){
                                if(globals.swarm.activeProducts.indexOf(globals.swarm.products[p.get('id')]['Charlie']) === -1){
                                    globals.swarm.activeProducts.push(globals.swarm.products[p.get('id')]['Charlie']);
                                }
                            }

                            if($('#nsccheck').is(':checked')){
                                if(globals.swarm.activeProducts.indexOf(globals.swarm.products[p.get('id')]['NSC']) === -1){
                                    globals.swarm.activeProducts.push(globals.swarm.products[p.get('id')]['NSC']);
                                }
                            }
                            if($('#uploadcheck').is(':checked')){
                                if(globals.swarm.activeProducts.indexOf(globals.swarm.products[p.get('id')]['Upload']) === -1){
                                    globals.swarm.activeProducts.push(globals.swarm.products[p.get('id')]['Upload']);
                                }
                            }
                        }
                    }
                });


                for (var i = globals.swarm.activeProducts.length - 1; i >= 0; i--) {

                    globals.products.forEach(function(p){
                        if(p.get("download").id == globals.swarm.activeProducts[i]){
                            if(!p.get("visible")){
                                p.set("visible", true);
                                Communicator.mediator.trigger('map:layer:change', {
                                    name: p.get("name"),
                                    isBaseLayer: false,
                                    visible: true
                                });
                            }
                        }
                    });
                }
                globals.swarm.activeProducts = globals.swarm.activeProducts.sort();
                Communicator.mediator.trigger('map:multilayer:change', globals.swarm.activeProducts);

            },

            updateSort: function(options) {
                var previousPos = options.model.get('ordinal');
                var shifts = {};  
                this.collection.remove(options.model);

                // Count special container collections
                var specialColl = this.collection.filter(function(m){return m.get("containerproduct");});
                options.position = options.position + specialColl.length;

                this.collection.each(function (model, index) {
                    var ordinal = index;
                    if (index >= options.position){
                        ordinal += 1;
                    }
                    model.set('ordinal', ordinal);
                });            

                shifts[options.model.get('name')] = previousPos-options.position;
                options.model.set('ordinal', options.position);
                this.collection.add(options.model, {at: options.position});

                this.render();
                
                Communicator.mediator.trigger("productCollection:sortUpdated", shifts);
            },

            onLayerSelectionChange: function(options) {
                if (options.isBaseLayer){
                    globals.baseLayers.forEach(function(model, index) {
                        model.set("visible", false);
                    });
                    globals.baseLayers.find(function(model) { return model.get('name') == options.name; }).set("visible", true);
                } else {
                    var product = globals.products.find(function(model) { return model.get('name') == options.name; });
                    if (product){
                            product.set("visible", options.visible);
                    }else{
                            globals.overlays.find(function(model) { return model.get('name') == options.name; }).set("visible", options.visible);
                    }
                }
            },
        });
        
        return {'LayerSelectionView':LayerSelectionView};
    });

}).call( this );