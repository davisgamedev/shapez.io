"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemUpdateReporter = void 0;
const utils_1 = require("../../core/utils");
const item_acceptor_1 = require("../components/item_acceptor");
const item_ejector_1 = require("../components/item_ejector");
const miner_1 = require("../components/miner");
const storage_1 = require("../components/storage");
const game_system_with_filter_1 = require("../game_system_with_filter");
// TODO object docs
// TODO CHECK LOGIC WIRES ISSUES
/**
 * If an entity is idle for this many frames, deactivate all of its components
 * => frame based to scale by target performance, lower targeted simulation tick
 *      should probably take a bit slower to perform the idle process
 */
const ENTITY_IDLE_FRAME_THRESHOLD = 60;
// /**
//  * @typedef {Object} Dep
//  * @property {Entity} effected
//  * @property {number} idleTime
//  * @property {boolean} idled
//  */
// interface Dep {
//     effectedEntity: Entity | BeltPathFwd;
//     idleTime: number;
//     idled: boolean;
// }
///////////////////////////////////////////////////////////////////////////
//                                                                       //
// THIS SYSTEM IS BASED ON THREE VERY IMPORTANT THINGS SO I MUST SCREAM  //
//                                                                       //
//  1. IDLE BELTPATHS CAN BE RESOLVED BY THE BELTPATH ITEM ACCEPTOR AND  //
//      COMPONENT BASED CHANGES                                          //
//  2. IDLE ENTITIES WITH ITEM ACCEPTORS ARE RESOLVED BY ITEM ACCEPTOR   //
//      BASED CHANGES                                                    //
//  3. IDLE ENTITIES WITH ITEM EJECTORS ARE RESOLVED BY A effected      //
//          ENTITY'S ITEM ACCEPTOR CHANGES                               //
//                                                                       //
// IN OTHER WORDS, THIS IS ALL effected ON AUTONOMOUS CHANGES TO ITEM   //
//      ACCEPTOR COMPONENTS                                              //
//                                                                       //
///////////////////////////////////////////////////////////////////////////
/**
 * Holds onto any updates that
 */
class SystemUpdateReporter extends game_system_with_filter_1.GameSystemWithFilter {
    constructor(root) {
        super(root, [
            item_acceptor_1.ItemAcceptorComponent,
            item_ejector_1.ItemEjectorComponent,
            storage_1.StorageComponent,
            miner_1.MinerComponent,
        ]);
        this.performUpdatesAsync = false;
        this.entityComponentContainers = new Map();
        this.entityDependencyMap = new Map();
        this.entityDependencyQueue = new Map();
        this.resolveDependencyQueue = new Set();
        this.globalReactivateEntityQueue = new Set();
        this.globalDeactivateEntityQueue = new Set();
        this.idleWaitSet = new Set();
        this.beltPaths = {
            container: {
                activeEntitySet: new Set(),
                reactivateEntityQueue: new Set(),
                deactivateEntityQueue: new Set(),
            },
            allBeltPaths: new Set(),
        };
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            const container = {
                activeEntitySet: new Set(),
                reactivateEntityQueue: new Set(),
                deactivateEntityQueue: new Set(),
            };
            this.entityComponentContainers.set(this.requiredComponentIds[i], container);
        }
        window.refreshReporter = this.forceRefreshReporter.bind(this);
    }
    acceptEntities(entities) {
        console.log("%cACCEPTING ENTITIES", "color: white; background-color: orange");
        console.dir(this);
        for (let i = entities.length - 1; i >= 0; --i)
            this.internalRegisterEntity(entities[i]);
        console.dir(this);
    }
    forceRefreshReporter() {
        console.dir(this);
        for (let arr = [...this.beltPaths.allBeltPaths.values()], i = arr.length - 1; i >= 0; --i) {
            this.globalReactivateEntityQueue.add(arr[i]);
        }
        for (let arr = [...this.allEntitiesSet.values()], i = arr.length - 1; i >= 0; --i)
            this.globalReactivateEntityQueue.add(arr[i]);
        console.dir(this);
        console.dir(this.globalReactivateEntityQueue.values());
    }
    acceptSystemUpdateResolver(resolver) {
        super.acceptSystemUpdateResolver(resolver);
        resolver.provideReporter(this);
    }
    ////////////////// Entities and Updates ///////////////
    checkEntityExists(entity) {
        return this.allEntitiesSet.has(entity) || this.beltPaths.allBeltPaths.has(entity);
    }
    // entDependentOn: [effectedEntities]
    // contains all entities (idled or not) that are effected on another entity's update
    /**
     * @param {string} componentId
     * @returns {Array<Entity>}
     */
    getActiveEntitiesByComponent(componentId) {
        return [
            ...this.entityComponentContainers.get(componentId).activeEntitySet,
        ];
    }
    queueNewDependency(entityDependentOn, dependentEntity) {
        const set = this.entityDependencyQueue.get(entityDependentOn) || new Set();
        set.add(dependentEntity);
        this.entityDependencyQueue.set(entityDependentOn, set);
    }
    // TODO: this could be faster
    resolveDependency(entityDepenentOn) {
        // can just remove the entries from the queue if it's queued
        this.entityDependencyQueue.delete(entityDepenentOn);
        const set = this.entityDependencyMap.get(entityDepenentOn);
        if (set) {
            // if we have items registered as dependencies we have to handle those later on
            this.resolveDependencyQueue.add(entityDepenentOn);
        }
    }
    reactivateEntity(entity, container) {
        if (!this.checkEntityExists(entity))
            return;
        container.activeEntitySet.add(entity);
        // check reactivate entity logic
        entity.active = true;
        entity.idleFrames = 0;
        this.idleWaitSet.delete(entity);
        // try to resolve any dependencies
        this.resolveDependency(entity);
    }
    // DEACTIVATE CALLED AFTER AN ENTITY IS IDLED
    deactivateEntity(entity, container) {
        if (!this.checkEntityExists(entity))
            return;
        entity.active = false;
        container.activeEntitySet.delete(entity);
    }
    onRemoveEntity(entity) {
        if (!entity.components) {
            this.beltPaths.allBeltPaths.delete(entity);
        }
        else {
            for (let i = this.requiredComponentIds.length - 1; i >= 0; --i) {
                if (entity.components[this.requiredComponentIds[i]]) {
                    const container = this.entityComponentContainers.get(this.requiredComponentIds[i]);
                    container.activeEntitySet.delete(entity);
                }
            }
        }
        this.idleWaitSet.delete(entity);
        this.resolveDependency(entity);
    }
    onAddEntity(entity) {
        if (!entity.components) {
            this.beltPaths.allBeltPaths.add(entity);
        }
        else {
            for (let i = this.requiredComponentIds.length - 1; i >= 0; --i) {
                if (entity.components[this.requiredComponentIds[i]]) {
                    const container = this.entityComponentContainers.get(this.requiredComponentIds[i]);
                    container.activeEntitySet.delete(entity);
                }
            }
        }
        this.globalReactivateEntityQueue.add(entity);
        this.idleWaitSet.delete(entity);
        this.resolveDependency(entity);
    }
    /**
     * @param {EntityComponentContainer} container
     */
    updateEntityComponentContainer(container) {
        /**
         * for anything being reactivated, try deleting it from the deactivate queue
         *  activation supercedes deactivation
         * then remove anyting left in the deactivate queue
         */
        for (let arr = [...container.reactivateEntityQueue.values()], i = arr.length - 1; i >= 0; --i) {
            const entity = arr[i];
            container.deactivateEntityQueue.delete(entity);
            if (!container.activeEntitySet.has(entity)) {
                this.reactivateEntity(entity, container);
            }
        }
        for (let arr = [...container.deactivateEntityQueue.values()], i = arr.length - 1; i >= 0; --i) {
            this.deactivateEntity(arr[i], container);
        }
        container.reactivateEntityQueue.clear();
        container.deactivateEntityQueue.clear();
    }
    updateDepContainers() {
        if (this.entityDependencyQueue.size > 0) {
            utils_1.logInterval("dependencyQueue: ", 60, this.entityDependencyQueue.size);
            // append dependencies to dependency maps
            for (let keys = [...this.entityDependencyQueue.keys()], vals = [...this.entityDependencyQueue.values()], i = keys.length - 1; i >= 0; --i) {
                const entDependentOn = keys[i];
                const dependentEntSet = vals[i];
                let set = this.entityDependencyMap.get(entDependentOn);
                if (!set) {
                    set = new Set();
                    this.entityDependencyMap.set(entDependentOn, set);
                }
                for (let arr = [...dependentEntSet.values()], i = arr.length - 1; i >= 0; --i) {
                    set.add(arr[i]);
                    this.idleWaitSet.add(arr[i]);
                }
            }
        }
        if (this.resolveDependencyQueue.size > 0) {
            // collect all of the entities being resolved
            const resolveEntities = new Set();
            utils_1.logInterval("entResolveQueue: ", 60, this.resolveDependencyQueue.size);
            for (let arr = [...this.resolveDependencyQueue.values()], i = arr.length - 1; i >= 0; --i) {
                const entityResolveDependents = arr[i];
                const set = this.entityDependencyMap.get(entityResolveDependents);
                if (set) {
                    for (let vals = [...set.values()], i = arr.length - 1; i >= 0; --i) {
                        resolveEntities.add(vals[i]);
                    }
                    this.entityDependencyMap.delete(entityResolveDependents);
                }
            }
            // reactivate all of their components
            for (let arr = [...resolveEntities.values()], i = arr.length - 1; i >= 0; --i) {
                this.globalReactivateEntityQueue.add(arr[i]);
            }
        }
        for (let arr = [...this.idleWaitSet.values()], i = arr.length - 1; i >= 0; --i) {
            const entity = arr[i];
            if (++entity.idleFrames > ENTITY_IDLE_FRAME_THRESHOLD) {
                this.globalDeactivateEntityQueue.add(entity);
                this.idleWaitSet.delete(entity);
            }
        }
        this.entityDependencyQueue.clear();
        this.resolveDependencyQueue.clear();
    }
    update() {
        const container = this.entityComponentContainers.get(item_ejector_1.ItemEjectorComponent.getId());
        try {
            utils_1.dirInterval("container", 60, container);
            const message = `
        Interval container:
            active: ${container.activeEntitySet.size},
            toDeactivate: ${container.deactivateEntityQueue.size},
            toActivate: ${container.reactivateEntityQueue.size},
        Globals:
            globalActivateQueue: ${this.globalReactivateEntityQueue.size},
            globalDeactivateQueue: ${this.globalDeactivateEntityQueue.size},
            entDependentMap: ${this.entityDependencyMap.size},
            entDependentQueue: ${this.entityDependencyQueue.size},
            entResolveQueue: ${this.resolveDependencyQueue.size},
            idleQueue: ${this.idleWaitSet.size},
        `;
            utils_1.logInterval("ejectorUpdates", 60, message);
            utils_1.dirInterval("ejectorActive", 60, container.activeEntitySet);
            utils_1.dirInterval("ejectorDeactivate:", 60, container.deactivateEntityQueue);
            utils_1.dirInterval("ejectorActivate:", 60, container.reactivateEntityQueue);
            utils_1.dirInterval("reporterFull", 60, this);
        }
        catch (e) {
            console.dir(e);
        }
        this.updateDepContainers();
        for (let entities = [...this.globalReactivateEntityQueue.values()], i = entities.length - 1; i >= 0; --i) {
            try {
                if (!entities[i])
                    continue;
                this.globalDeactivateEntityQueue.delete(entities[i]);
                if (!entities[i].components) {
                    this.beltPaths.container.reactivateEntityQueue.add(entities[i]);
                    continue;
                }
                for (let compIndex = this.requiredComponentIds.length - 1; compIndex >= 0; --compIndex) {
                    const comp = this.requiredComponentIds[compIndex];
                    if (entities[i].components[comp]) {
                        this.entityComponentContainers.get(comp).reactivateEntityQueue.add(entities[i]);
                    }
                }
            }
            catch (e) {
                console.dir(this.globalReactivateEntityQueue);
                console.log(entities[i]);
                console.dir(this);
            }
        }
        for (let entities = [...this.globalDeactivateEntityQueue.values()], i = entities.length - 1; i >= 0; --i) {
            if (!entities[i]) {
                console.error(this.globalDeactivateEntityQueue);
            }
            if (!entities[i].components) {
                this.beltPaths.container.deactivateEntityQueue.add(entities[i]);
                continue;
            }
            for (let compIndex = this.requiredComponentIds.length - 1; compIndex >= 0; --compIndex) {
                const comp = this.requiredComponentIds[compIndex];
                if (entities[i].components[comp]) {
                    this.entityComponentContainers.get(comp).deactivateEntityQueue.add(entities[i]);
                }
            }
        }
        this.globalReactivateEntityQueue.clear();
        this.globalDeactivateEntityQueue.clear();
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            const container = this.entityComponentContainers.get(this.requiredComponentIds[i]);
            this.updateEntityComponentContainer(container);
        }
        this.updateEntityComponentContainer(this.beltPaths.container);
    }
    /////////////// BeltPaths-Specific Logic /////////////////
    getActiveBeltPaths() {
        return [...this.beltPaths.container.activeEntitySet];
    }
    addBeltPath(beltPath) {
        this.onAddEntity(beltPath);
    }
    removeBeltPath(beltPath) {
        this.onRemoveEntity(beltPath);
    }
    giveItemAcceptorListener(entityWithAcceptor) {
        entityWithAcceptor.components.ItemAcceptor.reportOnItemAccepted(this, entityWithAcceptor);
    }
    giveItemEjectorListener(entityWithEjector) {
        entityWithEjector.components.ItemEjector.reportOnItemEjected(this, entityWithEjector);
    }
    reportBeltPathFull(beltPath, targetAcceptor) {
        //console.log("belt full");
        this.queueNewDependency(beltPath, beltPath);
        if (targetAcceptor) {
            this.queueNewDependency(targetAcceptor, beltPath);
            this.giveItemAcceptorListener(targetAcceptor);
        }
    }
    reportBeltPathEmpty(beltPath) {
        this.queueNewDependency(beltPath, beltPath);
    }
    reportEjectorFull(entityWithEjector, targetAcceptor) {
        this.queueNewDependency(entityWithEjector, entityWithEjector);
        this.queueNewDependency(targetAcceptor, entityWithEjector);
        this.giveItemAcceptorListener(targetAcceptor);
        this.giveItemEjectorListener(entityWithEjector);
    }
    reportEjectorEmpty(entityWithEjector) {
        this.queueNewDependency(entityWithEjector, entityWithEjector);
        this.giveItemEjectorListener(entityWithEjector);
    }
    reportAcceptorFull(entityWithAcceptor) {
        this.queueNewDependency(entityWithAcceptor, entityWithAcceptor);
        this.giveItemAcceptorListener(entityWithAcceptor);
    }
    reportAcceptorEmpty(entityWithAcceptor) {
        this.queueNewDependency(entityWithAcceptor, entityWithAcceptor);
        this.giveItemAcceptorListener(entityWithAcceptor);
    }
    reportBeltPathResolved(beltPath, target) {
        if (target)
            this.resolveDependency(target);
        this.resolveDependency(beltPath);
    }
    reportItemAcceptorAcceptedItem(entity) {
        this.resolveDependency(entity);
    }
    reportItemEjectorEjectedItem(entity, target) {
        this.resolveDependency(entity);
        if (target)
            this.resolveDependency(target);
    }
    //////////// Game System Overrides
    wasEntityRemoved(entity) {
        return entity && !this.allEntitiesSet.has(entity);
    }
    internalCheckEntityAfterComponentRemoval(entity) {
        super.internalCheckEntityAfterComponentRemoval(entity);
        if (this.wasEntityRemoved(entity))
            this.onRemoveEntity(entity);
    }
    internalRegisterEntity(entity) {
        super.internalRegisterEntity(entity);
        this.onAddEntity(entity);
    }
    internalPopEntityIfMatching(entity) {
        super.internalPopEntityIfMatching(entity);
        if (this.wasEntityRemoved(entity))
            this.onRemoveEntity(entity);
    }
    // full override
    refreshCaches() {
        // Remove all entities which are queued for destroy
        for (let arr = [...this.allEntitiesSet.values()], i = arr.length - 1, entity; (entity = arr[i]) && i >= 0; --i) {
            if (entity.queuedForDestroy || entity.destroyed) {
                this.allEntitiesSet.delete(entity);
                this.allEntitiesOutdated = true;
            }
        }
        this.getUpdatedEntitiesArray();
    }
    internalPostLoadHook() {
        this.refreshCaches();
    }
    // TODO: UI activity-checker
    //  tells player what systems are idle/in use, could be useful
    //      for large factory optimizations
    draw(parameters) { }
}
exports.SystemUpdateReporter = SystemUpdateReporter;
