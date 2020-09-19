/* typehints:start */
import { Component } from "./component";
import { Entity } from "./entity";
/* typehints:end */

import { GameRoot } from "./root";
import { GameSystem } from "./game_system";
import { arrayDelete, arrayDeleteValue, fastArrayDelete } from "../core/utils";

// TODO check indexOf and other O(n) operations in loops

/**
 * @typedef {number} EntityUid
 */

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
         * @type {Map<EntityUid, Entity>}
         */
        this.allEntitiesMap = new Map();

        /**
         * All allEntitiesMap keys for faster iteration
         * @type {Array<EntityUid>}
         */
        this.allEntitiesKeys = [];

        this.root.signals.entityAdded.add(this.internalPushEntityIfMatching, this);
        this.root.signals.entityGotNewComponent.add(this.internalReconsiderEntityToAdd, this);
        this.root.signals.entityComponentRemoved.add(this.internalCheckEntityAfterComponentRemoval, this);
        this.root.signals.entityQueuedForDestroy.add(this.internalPopEntityIfMatching, this);

        this.root.signals.postLoadHook.add(this.internalPostLoadHook, this);
        this.root.signals.bulkOperationFinished.add(this.refreshCaches, this);

        this.reporter = null;
    }

    acceptSystemUpdateResolver(resolver) {
        super.acceptSystemUpdateResolver(resolver);
        resolver.requireReporter(this);
    }

    acceptSystemUpdateReporter(reporter) {
        this.reporter = reporter;
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

        //assert(this.allEntitiesMap.has(entity.uid), "entity already in list: " + entity);
        this.internalRegisterEntity(entity);
    }

    // TODO double check we are clearing both Map and Keys!!!!!!
    /**
     *
     * @param {Entity} entity
     */
    internalCheckEntityAfterComponentRemoval(entity) {
        if (this.allEntitiesMap.has(entity.uid)) {
            // Entity wasn't interesting anyways
            return;
        }

        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            if (!entity.components[this.requiredComponentIds[i]]) {
                // Entity is not interesting anymore
                this.allEntitiesMap.delete(entity.uid);
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
        if (this.allEntitiesMap.has(entity.uid)) {
            return;
        }
        this.internalRegisterEntity(entity);
    }

    refreshCaches() {
        // Remove all entities which are queued for destroy
        for (let i = 0; i < this.allEntitiesKeys.length; ++i) {
            const entity = this.allEntitiesMap[this.allEntitiesKeys[i]];
            if (entity.queuedForDestroy || entity.destroyed) {
                this.allEntitiesMap.delete(entity.uid);
                fastArrayDelete(this.allEntitiesKeys, i);
            }
        }
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
        this.allEntitiesMap[entity.uid] = entity;
        this.allEntitiesKeys.push(entity.uid);

        if (this.root.gameInitialized && !this.root.bulkOperationRunning) {
            // Sort entities by uid so behaviour is predictable
            this.allEntitiesKeys.sort((a, b) => a - b);
        }
    }

    /**
     *
     * @param {Entity} entity
     */
    internalPopEntityIfMatching(entity) {
        if (this.root.bulkOperationRunning) {
            // We do this in refreshCaches afterwards
            return;
        }
        if (this.allEntitiesMap.delete(entity.uid)) {
            arrayDeleteValue(this.allEntitiesKeys, entity.uid);
        }
    }
}
