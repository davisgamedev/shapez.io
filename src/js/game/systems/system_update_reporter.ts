import { ModuleResolutionKind } from "typescript";
import { arrayDeleteValue, dirInterval, fastArrayDelete, fastSetAppend, logInterval } from "../../core/utils";
import { ItemAcceptorComponent } from "../components/item_acceptor";
import { ItemEjectorComponent } from "../components/item_ejector";
import { ItemProcessorComponent } from "../components/item_processor";
import { MinerComponent } from "../components/miner";
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
const ENTITY_IDLE_AFTER_FRAMES = 60;

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
export class SystemUpdateReporter extends GameSystemWithFilter {
    constructor(root) {
        super(root, [
            ItemAcceptorComponent,
            ItemEjectorComponent,
            StorageComponent,
            MinerComponent,
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
    //   * @type {Map<ComponentId, Entity>}
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

    checkEntityExists(entity: Entity) {
        return this.allEntitiesSet.has(entity) || this.beltPaths.allBeltPaths.has(entity);
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
        if (this.entDependentOnMap.has(entity) || this.entDependentOnQueueMap.has(entity)) {
            this.resolveDependency(entity);
        }

        this.entIdleWaitSet.delete(entity);
        this.entIdleSet.delete(entity);

        if (!entity.components) {
            this.beltPaths.allBeltPaths.add(entity);
            this.beltPaths.container.activeEntitySet.add(entity);
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
        // if (!entity.components) {
        //     this.beltPaths.container.deactivateEntityQueue.add(entity);
        //     return;
        // }
        // for (let i = 0; i < this.requiredComponentIds.length; ++i) {
        //     if (entity.components[this.requiredComponentIds[i]] != null) {
        //         const container = this.entityComponentContainers.get(this.requiredComponentIds[i]);
        //         container.deactivateEntityQueue.add(entity);
        //     }
        // }
    }

    reactivateRequiredComponents(entity: Entity) {
        this.addToRelevantQueues(entity, "reactivateEntityQueue");
    }

    // entDependentOn: [effectedEntities]
    // contains all entities (idled or not) that are effected on another entity's update
    entDependentOnMap: Map<Entity, Set<Entity>> = new Map();

    // queue to determine who is added to map (some entities are removed during updates)
    entDependentOnQueueMap: Map<Entity, Set<Entity>> = new Map();

    // all entDependentOnedencies queued to be resolved
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
        return [
            ...(this.entityComponentContainers.get(componentId) as EntityComponentContainer).activeEntitySet,
        ];
    }

    queueNewDependency(entDependentOn: Entity, dependentEnt: Entity) {
        return;
        // if (
        //     this.entDependentOnMap.has(entDependentOn) &&
        //     this.entDependentOnMap.get(entDependentOn).has(dependentEnt)
        // ) {
        //     return;
        // }

        const set = this.entDependentOnQueueMap.get(entDependentOn) || new Set();
        set.add(dependentEnt);
        this.entDependentOnQueueMap.set(entDependentOn, set);
    }

    // TODO: this could be faster
    resolveDependency(entDependentOn: Entity) {
        this.entDependentOnQueueMap.delete(entDependentOn);
        const set = this.entDependentOnMap.get(entDependentOn);
        if (set) {
            this.entResolveQueue = new Set([...set, ...this.entResolveQueue]);
        }
        this.reactivateRequiredComponents(entDependentOn);
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
        for (
            let arr = [...container.reactivateEntityQueue.values()], i = arr.length - 1, entity;
            (entity = arr[i]) && i >= 0;
            --i
        ) {
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
        for (
            let arr = [...container.deactivateEntityQueue.values()], i = arr.length - 1, entity;
            (entity = arr[i]) && i >= 0;
            --i
        ) {
            container.activeEntitySet.delete(entity);
        }

        container.reactivateEntityQueue.clear();
        container.deactivateEntityQueue.clear();
    }

    updateDepContainers() {
        if (this.entDependentOnQueueMap.size > 0) {
            logInterval("dependencyQueue: ", 60, this.entDependentOnQueueMap.size);
            // append dependencies to dependency maps
            for (
                let keys = [...this.entDependentOnQueueMap.keys()],
                    vals = [...this.entDependentOnQueueMap.values()],
                    i = keys.length - 1;
                i >= 0;
                --i
            ) {
                const entDependentOn: Entity = keys[i];
                const dependentEntSet: Set<Entity> = vals[i];

                const set = this.entDependentOnMap.get(entDependentOn) || [];
                this.entDependentOnMap.set(entDependentOn, new Set([...dependentEntSet, ...set]));
                this.entIdleWaitSet = new Set([...dependentEntSet, ...this.entIdleWaitSet]);

                //this.entDependentOnMap.set(entDependentOn, fastSetAppend(set, dependentEntSet));
                //fastSetAppend(this.entIdleWaitSet, dependentEntSet);
            }
        }

        if (this.entResolveQueue.size > 0) {
            // collect all of the entities being resolved
            let resolveEntities = new Set();
            logInterval("entResolveQueue: ", 60, this.entResolveQueue.size);

            for (
                let arr = [...this.entResolveQueue.values()], i = arr.length - 1, entDependentOn;
                (entDependentOn = arr[i]) && i >= 0;
                --i
            ) {
                //fastSetAppend(resolveEntities, this.entDependentOnMap.get(entDependentOn) || new Set());

                const set = this.entDependentOnMap.get(entDependentOn) || [];
                resolveEntities = new Set([...set, ...resolveEntities]);
                this.entDependentOnMap.delete(entDependentOn);
            }
            // reactivate all of their components
            for (
                let arr = [...resolveEntities.values()], i = arr.length - 1, entity;
                (entity = arr[i]) && i >= 0;
                --i
            ) {
                this.entIdleWaitSet.delete(entity);
                this.entIdleSet.delete(entity);
                this.reactivateRequiredComponents(entity);
            }
        }

        // if we have waited long enough we can start to idle components
        // THIS ISN't ALWAYS WORKING
        if (++this.entIdleWaitFrames > ENTITY_IDLE_AFTER_FRAMES) {
            console.log("Trying to idle....");
            if (this.entIdleWaitSet.size > 0) {
                console.log("Idling " + this.entIdleWaitSet.size + " entities.");
                for (
                    let arr = [...this.entIdleWaitSet.values()], i = arr.length - 1, entity;
                    (entity = arr[i]) && i >= 0;
                    --i
                ) {
                    if (!this.entIdleSet.has(entity)) {
                        this.deactivateRequiredComponents(entity);
                        this.entIdleSet.add(entity);
                    }
                }
            }
            this.entIdleWaitSet.clear();
            this.entIdleWaitFrames = 0;
        }

        this.entDependentOnQueueMap.clear();
        this.entResolveQueue.clear();
    }

    update() {
        const container = this.entityComponentContainers[ItemEjectorComponent.getId()];

        try {
            const message = `
        Interval container:
            active: ${container.activeEntitySet.size},
            toDeactivate: ${container.deactivateEntityQueue.size},
            toActivate: ${container.reactivateEntityQueue.size},
        Globals:
            entDependentMap: ${this.entDependentOnMap.size},
            entDependentQueue: ${this.entDependentOnQueueMap.size},
            entResolveQueue: ${this.entResolveQueue.size},
            idleSet: ${this.entIdleSet.size},
            idleQueue: ${this.entIdleWaitSet.size},
        `;
            logInterval("ejectorUpdates", 60, message);
            dirInterval("ejectorActive", 60, container.activeEntitySet);
            dirInterval("ejectorDeactivate:", 60, container.deactivateEntityQueue);
            dirInterval("ejectorActivate:", 60, container.reactivateEntityQueue);
            dirInterval("GLobentDependentMap:", 60, this.entDependentOnMap);
            dirInterval("GLobentDependentQueue:", 60, this.entDependentOnQueueMap);
            dirInterval("GLobentResolveQueue:", 60, this.entResolveQueue);
            dirInterval("GLobidleSet:", 60, this.entIdleSet);
            dirInterval("GLobidleQueue:", 60, this.entIdleWaitSet);
        } catch (e) {
            console.log("error reporting containers in reporter");
        }
        this.updateDepContainers();

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

    addBeltPath(beltPath: Entity) {
        this.createComponents(beltPath);
    }

    removeBeltPath(beltPath: Entity) {
        this.deleteComponents(beltPath);
    }

    giveItemAcceptorListener(entityWithAcceptor: Entity) {
        entityWithAcceptor.components.ItemAcceptor.reportOnItemAccepted(this, entityWithAcceptor);
    }

    giveItemEjectorListener(entityWithEjector: Entity) {
        entityWithEjector.components.ItemEjector.reportOnItemEjected(this, entityWithEjector);
    }

    /**
     * Report and create entDependentOnendencies
     * On items with a
     */

    reportBeltPathFull(beltPath: Entity, targetAcceptor: Entity | null) {
        //console.log("belt full");
        this.queueNewDependency(beltPath, beltPath);
        if (targetAcceptor) {
            this.queueNewDependency(targetAcceptor, beltPath);
            this.giveItemAcceptorListener(targetAcceptor);
        }
    }

    reportBeltPathEmpty(beltPath: Entity) {
        this.queueNewDependency(beltPath, beltPath);
    }

    reportEjectorFull(entityWithEjector: Entity, targetAcceptor: Entity) {
        this.queueNewDependency(entityWithEjector, entityWithEjector);
        this.queueNewDependency(targetAcceptor, entityWithEjector);
        this.giveItemAcceptorListener(targetAcceptor);
        this.giveItemEjectorListener(entityWithEjector);
    }

    reportEjectorEmpty(entityWithEjector: Entity) {
        this.queueNewDependency(entityWithEjector, entityWithEjector);
        this.giveItemEjectorListener(entityWithEjector);
    }

    reportAcceptorFull(entityWithAcceptor: Entity) {
        this.queueNewDependency(entityWithAcceptor, entityWithAcceptor);
        this.giveItemAcceptorListener(entityWithAcceptor);
    }
    reportAcceptorEmpty(entityWithAcceptor: Entity) {
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
