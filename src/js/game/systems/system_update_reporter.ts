import { ModuleResolutionKind } from "typescript";
import { arrayDeleteValue, dirInterval, fastArrayDelete, fastSetAppend, logInterval } from "../../core/utils";
import { ItemAcceptorComponent } from "../components/item_acceptor";
import { ItemEjectorComponent } from "../components/item_ejector";
import { ItemProcessorComponent } from "../components/item_processor";
import { StorageComponent } from "../components/storage";
import { UndergroundBeltComponent } from "../components/underground_belt";
import { Entity } from "../entity";
import { GameSystemWithFilter } from "../game_system_with_filter";

// TODO object docs
// TODO CHECK LOGIC WIRES ISSUES

/**
 * If an entity is idle for this many frames, deactivate all of its components
 * => frame based to scale by target performance, lower targeted simulation tick
 *      should probably take a bit slower to perform the idle process
 */
const ENTITY_IDLE_AFTER_FRAMES = 150;

type ComponentId = string;

interface EntityComponentContainer {
    activeEntitySet: Set<Entity>;
    reactivateEntityQueue: Set<Entity>;
    deactivateEntityQueue: Set<Entity>;
}

interface BeltPathContainer {
    container: EntityComponentContainer;
    allBeltPaths: Set<Entity>;
}

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
export class SystemUpdateReporter extends GameSystemWithFilter {
    constructor(root) {
        super(root, [
            ItemAcceptorComponent,
            ItemEjectorComponent,
            ItemProcessorComponent,
            StorageComponent,
            UndergroundBeltComponent,
            // (and also BeltPaths added from Belt system)
        ]);
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            const container: EntityComponentContainer = {
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

    //  /**
    //   * @type {Map<ComponentId, EntityUid>}
    //   */
    entityComponentContainers: Map<ComponentId, EntityComponentContainer> = new Map();

    addToRelevantQueues(entity: Entity, setKey: string) {
        if (!entity.components) {
            (this.beltPaths.container[setKey] as Set<Entity>).add(entity);
            return;
        }
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            if (entity.components[this.requiredComponentIds[i]] != null) {
                const container = this.entityComponentContainers.get(this.requiredComponentIds[i]);
                (container[setKey] as Set<Entity>).add(entity);
            }
        }
    }

    checkEntityExists(entity) {
        if (!entity.comonents) return this.beltPaths.allBeltPaths.has(entity);
        else return this.allEntitiesSet.has(entity);
    }

    // TODO
    //we need to delete it from any and all component records
    //we will then need to release all of its dependencies
    deleteComponents(entity: Entity) {
        if (this.checkEntityExists(entity)) {
            this.entResolveQueue.add(entity);

            this.entIdleWaitSet.delete(entity);
            this.entIdleSet.delete(entity);

            if (!entity.components) {
                this.beltPaths.allBeltPaths.delete(entity);
            } else {
                this.allEntitiesSet.delete(entity);
                for (let i = 0; i < this.requiredComponentIds.length; ++i) {
                    if (entity.components[this.requiredComponentIds[i]] != null) {
                        this.entityComponentContainers
                            .get(this.requiredComponentIds[i])
                            .activeEntitySet.delete(entity);
                    }
                }
            }
            this.deactivateRequiredComponents(entity);
        }
    }

    createComponents(entity: Entity) {
        if (this.entDependencyMap.has(entity) || this.entDependencyQueueMap.has(entity)) {
            this.resolveDependency(entity);
        }

        this.entIdleWaitSet.delete(entity);
        this.entIdleSet.delete(entity);

        if (!entity.components) {
            this.beltPaths.allBeltPaths.add(entity);
        } else {
            this.allEntitiesSet.add(entity);
            for (let i = 0; i < this.requiredComponentIds.length; ++i) {
                if (entity.components[this.requiredComponentIds[i]] != null) {
                    this.entityComponentContainers
                        .get(this.requiredComponentIds[i])
                        .activeEntitySet.add(entity);
                }
            }
        }
        this.reactivateRequiredComponents(entity);
    }

    deactivateRequiredComponents(entity: Entity) {
        this.addToRelevantQueues(entity, "deactivateEntityQueue");
    }

    reactivateRequiredComponents(entity: Entity) {
        this.addToRelevantQueues(entity, "reactivateEntityQueue");
    }

    // entDependencyUid: [effectedUidEntities]
    // contains all entities (idled or not) that are effectedUid on another entity's update
    entDependencyMap: Map<Entity, Set<Entity>> = new Map();

    // queue to determine who is added to map (some entities are removed during updates)
    entDependencyQueueMap: Map<Entity, Set<Entity>> = new Map();

    // all entDependencyedencies queued to be resolved
    entResolveQueue: Set<Entity> = new Set();

    // all entities that have been idled (removed from updates);
    entIdleSet: Set<Entity> = new Set();

    // all entities that are awaiting idled, Entity: Frames
    entIdleWaitSet: Set<Entity> = new Set();
    entIdleWaitFrames: number = 0;

    beltPaths: BeltPathContainer = {
        container: {
            activeEntitySet: new Set(),
            reactivateEntityQueue: new Set(),
            deactivateEntityQueue: new Set(),
        },
        allBeltPaths: new Set(),
    };

    ////////////////// Entities and Updates ///////////////

    /**
     * @param {string} componentId
     * @returns {Array<Entity>}
     */
    getActiveEntitiesByComponent(componentId: ComponentId): Array<Entity> {
        dirInterval("componentContainers", 500, this.entityComponentContainers);
        return [
            ...(this.entityComponentContainers.get(componentId) as EntityComponentContainer).activeEntitySet,
        ];
    }

    queueNewDependency(entity: Entity, entDependency: Entity) {
        if (
            this.entDependencyMap.has(entDependency) &&
            this.entDependencyMap.get(entDependency).has(entDependency)
        ) {
            return;
        }

        const set = this.entDependencyQueueMap.get(entDependency);
        if (set) {
            set.add(entity);
        } else {
            this.entDependencyQueueMap.set(entDependency, new Set([entity]));
        }
    }

    // TODO: this could be faster
    resolveDependency(entDependency: Entity) {
        this.entDependencyQueueMap.delete(entDependency);
        const set = this.entDependencyMap.get(entDependency);
        if (set) {
            fastSetAppend(this.entResolveQueue, set);
        }
        this.reactivateRequiredComponents(entDependency);
    }

    /**
     * @param {EntityComponentContainer} container
     */
    updateEntityComponentContainer(container: EntityComponentContainer) {
        /**
         * for anything being reactivated, try deleting it from the deactivate queue
         *  activation supercedes deactivation
         * then remove anyting left in the deactivate queue
         */

        for (let it = container.reactivateEntityQueue.values(), entity = null; (entity = it.next().value); ) {
            container.deactivateEntityQueue.delete(entity);

            if (this.checkEntityExists(entity)) {
                if (!container.activeEntitySet.has(entity)) {
                    container.activeEntitySet.add(entity);
                    this.entIdleSet.delete(entity);
                    this.entIdleWaitSet.delete(entity);
                    this.entResolveQueue.add(entity);
                }
            }
        }

        // prevents activeEntitySet from passing in a deactivated component
        for (let it = container.deactivateEntityQueue.values(), entity = null; (entity = it.next().value); ) {
            container.activeEntitySet.delete(entity);
        }

        container.reactivateEntityQueue.clear();
        container.deactivateEntityQueue.clear();
    }

    updateDepContainers() {
        if (this.entDependencyQueueMap.size > 0) {
            // append dependencies to dependency maps
            for (
                let keys = [...this.entDependencyQueueMap.keys()],
                    vals = [...this.entDependencyQueueMap.values()],
                    i = keys.length - 1,
                    entDependency: Entity = keys[i],
                    entitiesSet: Set<Entity> = vals[i];
                i >= 0;
                --i, entDependency = keys[i], entitiesSet = vals[i]
            ) {
                const set = this.entDependencyMap.get(entDependency) || new Set();
                this.entDependencyMap.set(entDependency, fastSetAppend(set, entitiesSet));
                fastSetAppend(this.entIdleWaitSet, entitiesSet);
            }
            this.entDependencyQueueMap.clear();
        }

        if (this.entResolveQueue.size > 0) {
            // collect all of the entities being resolved
            const resolveEntities = new Set();
            for (
                let it = this.entResolveQueue.values(), entDependency = null;
                (entDependency = it.next().value);

            ) {
                fastSetAppend(resolveEntities, this.entDependencyMap.get(entDependency) || new Set());
                this.entDependencyMap.delete(entDependency);
            }
            // reactivate all of their components
            for (let it = resolveEntities.values(), entity = null; (entity = it.next().value); ) {
                this.entIdleWaitSet.delete(entity);
                this.entIdleSet.delete(entity);
                this.reactivateRequiredComponents(entity);
            }
            this.entResolveQueue.clear();
        }

        // if we have waited long enough we can start to idle components
        // THIS ISN't ALWAYS WORKING
        if (++this.entIdleWaitFrames > ENTITY_IDLE_AFTER_FRAMES) {
            if (this.entIdleWaitSet.size > 0) {
                console.log(
                    "%cTime to idle some systems! Total: " + this.entIdleWaitSet.size,
                    "color: white, background-color: purple"
                );
                for (let it = this.entIdleWaitSet.values(), entity = null; (entity = it.next().value); ) {
                    if (!this.entIdleSet.has(entity)) {
                        this.deactivateRequiredComponents(entity);
                        this.entIdleSet.add(entity);
                    }
                }
            }
            this.entIdleWaitSet.clear();
            this.entIdleWaitFrames = 0;
        }
    }

    update() {
        this.updateDepContainers();
        let message = "Reporter stats: ";

        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            const container = this.entityComponentContainers.get(this.requiredComponentIds[i]);
            this.updateEntityComponentContainer(container);

            message += `\n${this.requiredComponentIds[i]}: active: ${container.activeEntitySet.size}`;
        }
        this.updateEntityComponentContainer(this.beltPaths.container);
        message += `\nbeltPaths: active: ${this.beltPaths.container.activeEntitySet.size}, totalBeltPaths: ${
            this.beltPaths.allBeltPaths.size
        }, idled: ${(
            (this.beltPaths.container.activeEntitySet.size / this.beltPaths.allBeltPaths.size) *
            100
        ).toFixed(2)}%`;
        logInterval("SystemUpdateReporter update summary: ", 100, message);
    }

    /////////////// BeltPaths-Specific Logic /////////////////

    getActiveBeltPaths() {
        dirInterval("beltPaths", 500, this.beltPaths.container.activeEntitySet);
        return [...this.beltPaths.container.activeEntitySet];
    }

    addBeltPath(beltPath: Entity) {
        this.createComponents(beltPath);
    }

    removeBeltPath(beltPath: Entity) {
        this.deleteComponents(beltPath);
    }

    giveItemAcceptorListener(targetAcceptor: Entity) {
        targetAcceptor.components.ItemAcceptor.reportOnItemAccepted(this, targetAcceptor.uid);
    }

    /**
     * Report and create entDependencyendencies
     * On items with a
     */

    reportBeltPathFull(beltPath: Entity, targetAcceptor: Entity | null) {
        //console.log("belt full");
        this.queueNewDependency(beltPath, beltPath);
        if (targetAcceptor) {
            this.queueNewDependency(beltPath, targetAcceptor);
            this.giveItemAcceptorListener(targetAcceptor);
        }
    }

    reportBeltPathEmpty(beltPath: Entity) {
        this.queueNewDependency(beltPath, beltPath);
    }

    reportEjectorFull(entityWithEjector: Entity, targetAcceptor: Entity) {
        this.queueNewDependency(entityWithEjector, entityWithEjector);

        this.queueNewDependency(entityWithEjector, targetAcceptor);
        this.giveItemAcceptorListener(targetAcceptor);
    }

    reportEjectorEmpty(entityWithEjector: Entity) {
        //console.log("ejector empty");

        this.queueNewDependency(entityWithEjector, entityWithEjector);
    }

    reportAcceptorFull(entityWithAcceptor: Entity) {
        //console.log("acceptor full");

        this.queueNewDependency(entityWithAcceptor, entityWithAcceptor);
        this.giveItemAcceptorListener(entityWithAcceptor);
    }
    reportAcceptorEmpty(entityWithAcceptor: Entity) {
        //console.log("acceptor empty");

        this.queueNewDependency(entityWithAcceptor, entityWithAcceptor);
        this.giveItemAcceptorListener(entityWithAcceptor);
    }

    reportBeltPathResolved(beltPath: Entity, target: Entity) {
        if (target) this.resolveDependency(target);
        this.resolveDependency(beltPath);
    }

    reportItemAcceptorAcceptedItem(entity: Entity) {
        this.resolveDependency(entity);
    }

    reportItemEjectorEjectedItem(entity: Entity, target: Entity) {
        this.resolveDependency(entity);
        if (target) this.resolveDependency(target);
    }

    internalCheckEntityAfterComponentRemoval(entity) {
        super.internalCheckEntityAfterComponentRemoval(entity);
        this.deleteComponents(entity);
    }

    internalRegisterEntity(entity) {
        super.internalRegisterEntity(entity);
        this.createComponents(entity);
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
        super.refreshCaches();
    }

    // TODO: UI activity-checker
    //  tells player what systems are idle/in use, could be useful
    //      for large factory optimizations
    draw(parameters) {}
}
