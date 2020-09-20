"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemUpdateReporter = void 0;
const utils_1 = require("../../core/utils");
const item_acceptor_1 = require("../components/item_acceptor");
const item_ejector_1 = require("../components/item_ejector");
const item_processor_1 = require("../components/item_processor");
const storage_1 = require("../components/storage");
const underground_belt_1 = require("../components/underground_belt");
const game_system_with_filter_1 = require("../game_system_with_filter");
// TODO object docs
// TODO CHECK LOGIC WIRES ISSUES
/**
 * If an entity is idle for this many frames, deactivate all of its components
 * => frame based to scale by target performance, lower targeted simulation tick
 *      should probably take a bit slower to perform the idle process
 */
const ENTITY_IDLE_AFTER_FRAMES = 150;
// /**
//  * @typedef {Object} Dep
//  * @property {EntityUid} effectedUid
//  * @property {number} idleTime
//  * @property {boolean} idled
//  */
// interface Dep {
//     effectedUidEntity: Entity | BeltPathFwd;
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
//  3. IDLE ENTITIES WITH ITEM EJECTORS ARE RESOLVED BY A effectedUid      //
//          ENTITY'S ITEM ACCEPTOR CHANGES                               //
//                                                                       //
// IN OTHER WORDS, THIS IS ALL effectedUid ON AUTONOMOUS CHANGES TO ITEM   //
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
            item_processor_1.ItemProcessorComponent,
            storage_1.StorageComponent,
            underground_belt_1.UndergroundBeltComponent,
        ]);
        //  /**
        //   * @type {Map<ComponentId, EntityUid>}
        //   */
        this.entityComponentContainers = new Map();
        // entDependencyUid: [effectedUidEntities]
        // contains all entities (idled or not) that are effectedUid on another entity's update
        this.entDependencyMap = new Map();
        // queue to determine who is added to map (some entities are removed during updates)
        this.entDependencyQueueMap = new Map();
        // all entDependencyedencies queued to be resolved
        this.entResolveQueue = new Set();
        // all entities that have been idled (removed from updates);
        this.entIdleSet = new Set();
        // all entities that are awaiting idled, Entity: Frames
        this.entIdleWaitSet = new Set();
        this.entIdleWaitFrames = 0;
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
    }
    acceptSystemUpdateResolver(resolver) {
        super.acceptSystemUpdateResolver(resolver);
        resolver.provideReporter(this);
    }
    addToRelevantQueues(entity, setKey) {
        if (!entity.components) {
            this.beltPaths.container[setKey].add(entity);
            return;
        }
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            if (entity.components[this.requiredComponentIds[i]] != null) {
                const container = this.entityComponentContainers.get(this.requiredComponentIds[i]);
                container[setKey].add(entity);
            }
        }
    }
    checkEntityExists(entity) {
        if (!entity.comonents)
            return this.beltPaths.allBeltPaths.has(entity);
        else
            return this.allEntitiesSet.has(entity);
    }
    // TODO
    //we need to delete it from any and all component records
    //we will then need to release all of its dependencies
    deleteComponents(entity) {
        if (this.checkEntityExists(entity)) {
            this.entResolveQueue.add(entity);
            this.deactivateRequiredComponents(entity);
            this.entIdleWaitSet.delete(entity);
            this.entIdleSet.delete(entity);
            if (!entity.components) {
                this.beltPaths.allBeltPaths.delete(entity);
            }
            else {
                this.allEntitiesSet.delete(entity);
                for (let i = 0; i < this.requiredComponentIds.length; ++i) {
                    if (entity.components[this.requiredComponentIds[i]] != null) {
                        this.entityComponentContainers
                            .get(this.requiredComponentIds[i])
                            .activeEntitySet.delete(entity);
                    }
                }
            }
        }
    }
    deactivateRequiredComponents(entity) {
        this.addToRelevantQueues(entity, "deactivateEntityQueue");
    }
    reactivateRequiredComponents(entity) {
        this.addToRelevantQueues(entity, "reactivateEntityQueue");
    }
    ////////////////// Entities and Updates ///////////////
    /**
     * @param {string} componentId
     * @returns {Array<Entity>}
     */
    getActiveEntitiesByComponent(componentId) {
        return [
            ...this.entityComponentContainers.get(componentId).activeEntitySet,
        ];
    }
    queueNewDependency(entity, entDependency) {
        if (this.entDependencyMap.has(entDependency) &&
            this.entDependencyMap.get(entDependency).has(entDependency)) {
            return;
        }
        const set = this.entDependencyQueueMap.get(entDependency);
        if (set) {
            set.add(entity);
        }
        else {
            this.entDependencyQueueMap.set(entDependency, new Set([entity]));
        }
    }
    // TODO: this could be faster
    resolveDependency(entDependency) {
        this.entDependencyQueueMap.delete(entDependency);
        const set = this.entDependencyMap.get(entDependency);
        if (set) {
            utils_1.fastSetAppend(this.entResolveQueue, set);
        }
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
        for (let it = container.reactivateEntityQueue.values(), entity = null; (entity = it.next().value);) {
            container.deactivateEntityQueue.delete(entity);
            if (this.checkEntityExists(entity)) {
                container.activeEntitySet.add(entity);
            }
        }
        for (let it = container.deactivateEntityQueue.values(), entity = null; (entity = it.next().value);) {
            container.activeEntitySet.delete(entity);
        }
    }
    updateDepContainers() {
        if (this.entDependencyQueueMap.size > 0) {
            // append dependencies to dependency maps
            for (let keys = [...this.entDependencyQueueMap.keys()], vals = [...this.entDependencyQueueMap.values()], i = keys.length - 1, entDependency = keys[i], entitiesSet = vals[i]; i >= 0; --i, entDependency = keys[i], entitiesSet = vals[i]) {
                const set = this.entDependencyMap.get(entDependency) || new Set();
                this.entDependencyMap.set(entDependency, utils_1.fastSetAppend(set, entitiesSet));
                utils_1.fastSetAppend(this.entIdleWaitSet, entitiesSet);
            }
            this.entDependencyQueueMap.clear();
        }
        if (this.entResolveQueue.size > 0) {
            // collect all of the entities being resolved
            const resolveEntities = new Set();
            for (let it = this.entResolveQueue.values(), entDependency = null; (entDependency = it.next().value);) {
                utils_1.fastSetAppend(resolveEntities, this.entDependencyMap.get(entDependency) || new Set());
                this.entDependencyMap.delete(entDependency);
            }
            // reactivate all of their components
            for (let it = resolveEntities.values(), entity = null; (entity = it.next().value);) {
                this.entIdleWaitSet.delete(entity);
                this.entIdleSet.delete(entity);
                this.reactivateRequiredComponents(entity);
            }
            this.entResolveQueue.clear();
        }
        // if we have waited long enough we can start to idle components
        if (++this.entIdleWaitFrames > ENTITY_IDLE_AFTER_FRAMES) {
            for (let it = this.entIdleWaitSet.values(), entity = null; (entity = it.next().value);) {
                if (!this.entIdleSet.has(entity)) {
                    this.deactivateRequiredComponents(entity);
                    this.entIdleSet.add(entity);
                }
            }
            this.entIdleWaitFrames = 0;
        }
    }
    update() {
        this.updateDepContainers();
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            this.updateEntityComponentContainer(this.entityComponentContainers.get(this.requiredComponentIds[i]));
        }
        this.updateEntityComponentContainer(this.beltPaths.container);
    }
    /////////////// BeltPaths-Specific Logic /////////////////
    getActiveBeltPaths() {
        return [...this.beltPaths.container.activeEntitySet];
    }
    addBeltPath(beltPath) {
        this.beltPaths.allBeltPaths.add(beltPath);
        this.beltPaths.container.reactivateEntityQueue.add(beltPath);
    }
    removeBeltPath(beltPath) {
        this.deleteComponents(beltPath);
    }
    giveItemAcceptorListener(targetAcceptor) {
        targetAcceptor.components.ItemAcceptor.reportOnItemAccepted(this, targetAcceptor.uid);
    }
    /**
     * Report and create entDependencyendencies
     * On items with a
     */
    reportBeltPathFull(beltPath, targetAcceptor) {
        //console.log("belt full");
        this.queueNewDependency(beltPath, beltPath);
        if (targetAcceptor) {
            this.queueNewDependency(beltPath, targetAcceptor);
            this.giveItemAcceptorListener(targetAcceptor);
        }
    }
    reportBeltPathEmpty(beltPath) {
        this.queueNewDependency(beltPath, beltPath);
    }
    reportEjectorFull(entityWithEjector, targetAcceptor) {
        this.queueNewDependency(entityWithEjector, entityWithEjector);
        this.queueNewDependency(entityWithEjector, targetAcceptor);
        this.giveItemAcceptorListener(targetAcceptor);
    }
    reportEjectorEmpty(entityWithEjector) {
        //console.log("ejector empty");
        this.queueNewDependency(entityWithEjector, entityWithEjector);
    }
    reportAcceptorFull(entityWithAcceptor) {
        //console.log("acceptor full");
        this.queueNewDependency(entityWithAcceptor, entityWithAcceptor);
        this.giveItemAcceptorListener(entityWithAcceptor);
    }
    reportAcceptorEmpty(entityWithAcceptor) {
        //console.log("acceptor empty");
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
    internalCheckEntityAfterComponentRemoval(entity) {
        super.internalCheckEntityAfterComponentRemoval(entity);
        this.deleteComponents(entity);
    }
    internalRegisterEntity(entity) {
        super.internalRegisterEntity(entity);
        this.reactivateRequiredComponents(entity);
    }
    internalPopEntityIfMatching(entity) {
        if (this.allEntitiesSet.delete(entity)) {
            this.deleteComponents(entity);
        }
        super.internalPopEntityIfMatching(entity);
    }
    refreshCaches() {
        // Remove all entities which are queued for destroy
        for (let set = [...this.allEntitiesSet], i = set.length - 1, entity = set[i]; i >= 0; --i) {
            if (entity.queuedForDestroy || entity.destroyed) {
                this.deactivateRequiredComponents(entity);
                this.deleteComponents(entity);
            }
        }
    }
    // TODO: UI activity-checker
    //  tells player what systems are idle/in use, could be useful
    //      for large factory optimizations
    draw(parameters) { }
}
exports.SystemUpdateReporter = SystemUpdateReporter;
