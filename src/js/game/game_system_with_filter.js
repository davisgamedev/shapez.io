/* typehints:start */
import { Component } from "./component";
import { Entity } from "./entity";
/* typehints:end */

import { GameRoot } from "./root";
import { GameSystem } from "./game_system";
import { arrayDelete, arrayDeleteValue, fastArrayDelete } from "../core/utils";
import { globalConfig } from "../core/config";

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

        this.allEntitiesSet = new Set();
        this.allEntitiesAsArray = [];
        this.allEntitiesOutdated = true;

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

    getUpdatedEntitiesArray(outdated = false) {
        if (this.allEntitiesOutdated || outdated) {
            this.allEntitiesAsArray = [...this.allEntitiesSet];
            this.allEntitiesOutdated = false;
        }
        return this.allEntitiesAsArray;
    }

    /**
     * @param {Entity} entity
     */
    internalPushEntityIfMatching(entity) {
        if (this.allEntitiesSet.has(entity)) return;
        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            if (!entity.components[this.requiredComponentIds[i]]) return;
        }

        this.internalRegisterEntity(entity);
    }

    // TODO double check we are clearing both Map and Keys!!!!!!
    /**
     *
     * @param {Entity} entity
     */
    internalCheckEntityAfterComponentRemoval(entity) {
        if (this.allEntitiesSet.has(entity.uid)) {
            // Entity wasn't interesting anyways
            return;
        }

        for (let i = 0; i < this.requiredComponentIds.length; ++i) {
            if (!entity.components[this.requiredComponentIds[i]]) {
                this.allEntitiesSet.delete(entity);
                this.allEntitiesOutdated = true;
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
        if (this.allEntitiesSet.delete(entity)) {
            this.allEntitiesOutdated = true;
            return;
        }
        this.internalRegisterEntity(entity);
    }

    refreshCaches() {
        // Remove all entities which are queued for destroy
        for (
            let arr = [...this.allEntitiesSet.values()], i = arr.length - 1, entity;
            (entity = arr[i]) && i >= 0;
            --i
        ) {
            if (entity.queuedForDestroy || entity.destroyed) {
                this.allEntitiesSet.delete(entity);
                this.allEntitiesOutdated = true;
            }
        }
        this.getUpdatedEntitiesArray();
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
        this.allEntitiesOutdated = true;

        if (this.root.gameInitialized && !this.root.bulkOperationRunning) {
            // Sort entities by uid so behaviour is predictable
            // do we need this? could probs push this into the refresh process
            // this.allEntitiesSet = new Set([...this.allEntitiesSet].sort((a, b) => a - b));
            this.getUpdatedEntitiesArray();
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
        this.allEntitiesSet.delete(entity);
        this.allEntitiesOutdated = true;
    }
}
