/* typehints:start */
import { Component } from "./component";
import { Entity } from "./entity";
/* typehints:end */

import { GameRoot } from "./root";
import { GameSystem } from "./game_system";

import SWorker from "simple-web-worker";
import { globalConfig } from "../core/config";

export class GameSystemWithFilter extends GameSystem {
    /**
     * Constructs a new game system with the given component filter. It will process
     * all entities which have *all* of the passed components
     * @param {GameRoot} root
     * @param {Array<typeof Component>} requiredComponents
     */
    constructor(root, requiredComponents) {
        super(root);
        this.requiredComponents = requiredComponents;
        this.requiredComponentIds = requiredComponents.map(component => component.getId());

        /**
         * All entities which match the current components
         * @type {Set<Entity>}
         */
        this.allEntitiesSet = new Set();
        this.allEntitiesArray = [];
        this.allEntitiesArrayIsOutdated = true;
        this.entitiesQueuedToDelete = [];

        this.root.signals.entityAdded.add(this.internalPushEntityIfMatching, this);
        this.root.signals.entityGotNewComponent.add(this.internalReconsiderEntityToAdd, this);
        this.root.signals.entityComponentRemoved.add(this.internalCheckEntityAfterComponentRemoval, this);
        this.root.signals.entityQueuedForDestroy.add(this.internalPopEntityIfMatching, this);

        this.root.signals.postLoadHook.add(this.internalPostLoadHook, this);
        this.root.signals.bulkOperationFinished.add(this.refreshCaches, this);

        // these only needed with async logic but could be useful later on
        this.idMap = globalConfig.useAsyncUpdates? new Map() : null;
        this.syncIdQueue = globalConfig.useAsyncUpdates? [] : null;

        // oh god am I a clone??
        this.isClone = false;

        // clones only needed for async updates
        globalConfig.useAsyncUpdates && this.createClone();

        this.virtualId = (requiredComponents && requiredComponents[0]);
        assert()
    }

    getVirtualId() {
        throw new Error("GameSystem.getId() called without an implementation!!");
    }
    /**
     * Let's talk about clones
     *  - needed for async updates to share entities.
     *  - entities must remain with the parent, so other entities can cross-access
     *  - but internal entities must be updated elsehow (with the clone)
     *  - clone updates are called within parent's updateAsync methods
     *  - clone update asyncs must NEVER be called
     */

    createClone() {
        if(this.isClone) throw new Error("Oh no they're spreading! (a clone of a gamesystemwithfilter managed to call its own createClone method)");
        this.clone = null;
        this.clone = Object.assign(this.clone, this); // shallow clone for the unimportant bits
        this.clone.isClone = true; // don't get it twisted kid
        this.cloneUpdate = this.clone.update.bind(this.clone);
        this.cloneSyncRequired = true;
    }
        
    /**
     * async processes:
     *  U1: acquireInternalDeltas:
     *      - call update() on clone [internal working copy]
     *      - will update controlled components, and external components will 
     *          potentially update other components within entities
     *              - we can probably do this per entity
     */

    /**
     * In system manager, we modify the master copy, based on all of the virtual changes created within the virtual updates
     * 
     * THE COMPONENT SYSTEMS CONTAIN A COPIED SET TOO DURING UPDATE
     * 
     * 
     * 
     * ********BIG ISSUE*****************
     *      => there is no scope in a thread, what actulaly happens to entities
     * 
     */
     

     // receive the read only copy, so we can safely avoid double writes
     //     notes, still a risk of multi
     async u0_asyncDeepCopyEntities(readOnlyEntityCopy) {

     }



     // performs internal update on cloned elements
    async u1_async_internalVirtualUpdate() {
        
        if (this.clone && this.clone.clone != null) {
            // this can be caused by calling updateAsync within the clone
            console.error('[GameSystemWithFilter.updateCloneEntities]: CLONE RECURSION DETECTED, DELETING SECOND CLONE');
            this.clone.clone = null;
        }
        /**
         * clone update is called
         * threads joined in systemmanager
         * systemmanager dispatches refresh/sync caches
         * clone data is copied in, original data is copied back out
         */
        const updateProcess = this.cloneUpdate;

        return SWorker.run(updateProcess).catch(e => console.error(e));
    }

    // creates set of affected components for affected entities (by uid)
    async u2_async_aggregateDeltas() {

    }

    // returns the delta containers
    u3_sync_getDeltas() {

    }

    // u4, in system manager, applies a
    

    async asyncU4_UpdateCaches() {

    }

    tryUpdateEntitiesArray() {
        if (this.allEntitiesArrayIsOutdated) {
            this.allEntitiesArray = [...this.allEntitiesSet.values()];
            this.allEntitiesArrayIsOutdated = false;
        }
    }

    /**
     * @param {Entity} entity
     */
    internalPushEntityIfMatching(entity) {
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            if (!entity.components[this.requiredComponentIds[i]]) {
                return;
            }
        }

        assert(!this.allEntitiesSet.has(entity), "entity already in list: " + entity);
        this.internalRegisterEntity(entity);
    }

    /**
     *
     * @param {Entity} entity
     */
    internalCheckEntityAfterComponentRemoval(entity) {
        if (!this.allEntitiesSet.has(entity)) {
            // Entity wasn't interesting anyways
            return;
        }

        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            if (!entity.components[this.requiredComponentIds[i]]) {
                // Entity is not interesting anymore
                this.allEntitiesArrayIsOutdated = this.allEntitiesSet.delete(entity);
                
                this.idMap && this.idMap.delete(entity.uid);
                this.syncIdQueue && this.syncIdQueue.push(entity.uid);
            }
        }
    }

    /**
     *
     * @param {Entity} entity
     */
    internalReconsiderEntityToAdd(entity) {
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            if (!entity.components[this.requiredComponentIds[i]]) {
                return;
            }
        }
        if (this.allEntitiesSet.has(entity)) {
            return;
        }
        this.internalRegisterEntity(entity);
    }

    synchronizeCloneCaches() {
        // call refresh caches, which will also call internalSync
        this.refreshCaches();
    }

    internalSynchronizeCloneCaches() {

        assert(!this.idMap, "[gameSystemWithFilter]: internalSynchronizeCloneCache called without proper vars (idMap) created!");


        // first verify data (deleted during async update of another system)
        
        for(let i = this.syncIdQueue.length - 1; i >= 0; --i) {
            const cloneEntityFromParentId = this.clone.idMap.get(this.syncIdQueue[i]);

            this.clone.allEntitiesArrayIsOutdated = 
                this.clone.allEntitiesSet.delete(cloneEntityFromParentId) || 
                this.clone.allEntitiesArrayIsOutdated;
        }
        for(let i = this.clone.syncIdQueue.length - 1; i >= 0; --i) {
            const parentEntityFromCloneId = this.idMap.get(this.clone.syncIdQueue[i]);

            this.allEntitiesArrayIsOutdated = 
                this.allEntitiesSet.delete(parentEntityFromCloneId) || 
                this.allEntitiesArrayIsOutdated;
        }

        this.tryUpdateEntitiesArray();
        this.clone.tryUpdateEntitiesArray();

        for(let i = this.clone.allEntitiesArray.length - 1; i >= 0; --i) {
            const entity = this.allEntitiesArray[i];
            entity.components[this.getId()]
        }

        // copy clone data in
        //this.allEntitiesSet = new Set([...this.clone.allEntitiesSet.values()]);
        //this.allEntitiesArray = [...this.clone.allEntitiesArray];

        this.allEntities
        /**
         * TODO: figure out who's caches need to be refreshed. 
         * TODO: figure out how to merge objects? what if one is updated by another one while it's waiting to clone back in?
         */

        // copy clone data back out (we might manage)
        this.clone.allEntitiesArray = [...this.allEntitiesArray];
        this.clone.allEntitiesSet = new Set(this.clone.allEntitiesArray);

        

        /**
         * We have some challenges here.
         *  - cloned entities will always be unequal (or at least they should be in theory)
         *  - So, the solution of getting corresponding entities between normal and cloned sets
         *  - involves an idMap of <EntityUid, Entity> since those should be equal.
         *  
         * Synchronization process
         *  - 
         */
        if(this.cloneSyncRequired && this.idMap) {


            for(let i = this.syncIdQueue.length - 1; i >= 0; --i) {
                this.clone.delete(
                    this.clone.idMap.get(this.syncIdQueue[i])
                    );
            }

            this.clone.tryUpdateEntitiesArray();

            // I think we might need to deep copy here too, both into (in updateAsync) and out of (here)
            //  this isn't all that punishing since we can run these async as well
            this.allEntitiesSet = new Set([...this.clone.allEntitiesSet.values()]);
            this.allEntitiesArray = [...this.clone.allEntitiesArray];
            this.

            /*
                Issue:
                    - clone and this entities will always be different
                    - we need to iterate and create some kind of ids map to check all of these
            */

            for(let i = this.clone.allEntitiesArray.length - 1; i >= 0 ; --i) {

                const cloneEntity = this.clone.allEntitiesArray[i];

                let entity
                const entity = this.idMap.get(cloneEntity.uid);
                
                if (cloneEntity.queuedForDestroy || cloneEntity.destroyed)

                if(!this.idMap.has(cloneEntity.uid)) {
                    this.internalRegisterEntity(cloneEntity);
                }
                else if(entity)


                const entity = this.clone.allEntitiesArray[i];
                if(!this.allEntitiesSet.has(entity)) {
                    this.allEntitiesSet.add(entity);
                    if(!this.allEntitiesArrayIsOutdated) this.allEntitiesArrayIsOutdated = true;
                }
                else if()
            }
 

            this.entitiesQueuedToDelete = [...this.entitiesQueuedToDelete, ...this.clone.entitiesQueuedToDelete];
            this.cloneSyncRequired = false;
        }

    }


    refreshCaches() {

        globalConfig.useAsyncUpdates && this.internalSynchronizeCloneCaches();

        // Remove all entities which are queued for destroy
        if (this.entitiesQueuedToDelete.length > 0) {
            for (let i = this.entitiesQueuedToDelete.length - 1; i >= 0; --i) {
                const entity = this.entitiesQueuedToDelete[i];
                this.allEntitiesArrayIsOutdated = this.allEntitiesSet.delete(entity) || this.allEntitiesArrayIsOutdated;
                this.idMap && this.idMap.delete(entity.uid);
            }
            this.entitiesQueuedToDelete = [];
        }


        // called here in case a delete executed mid frame
        this.tryUpdateEntitiesArray();
    }

    /**
     * Recomputes all target entities after the game has loaded
     */
    internalPostLoadHook() {
        this.refreshCaches();
    }

    /**
     *
     * @param {Entity} entity
     */
    internalRegisterEntity(entity) {
        this.allEntitiesSet.add(entity);
        this.allEntitiesArray.push(entity);
        this.idMap && this.idMap.set(entity.uid, entity);
        // do we need to worry about syncIdQueue here?
        // will there be a case where something is both deleted and created in the same frame?
    }

    /**
     *
     * @param {Entity} entity
     */
    internalPopEntityIfMatching(entity) {
        if (this.root.bulkOperationRunning) {
            this.entitiesQueuedToDelete.push(entity);
            return;
        }
        this.allEntitiesArrayIsOutdated = this.allEntitiesSet.delete(entity);

        this.idMap && this.idMap.delete(entity.uid);
        this.syncIdQueue && this.syncIdQueue.push(entity.uid);
    }
}
