
// globals
define(['backbone', 'objectStore'], function(Backbone, ObjectStore) {

    var swarm_model = Backbone.Model.extend({data:[]});
    return {
        version: "2.2",
        objects: new ObjectStore(),
        selections: new ObjectStore(),
        baseLayers: new Backbone.Collection(),
        products: new Backbone.Collection(),
        overlays: new Backbone.Collection(),
        swarm: new swarm_model()
    }
});
