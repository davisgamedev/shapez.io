import { globalConfig } from "../../core/config";
import { DrawParameters } from "../../core/draw_parameters";
import { fastArrayDelete } from "../../core/utils";
import { enumDirectionToVector } from "../../core/vector";
import { ItemAcceptorComponent } from "../components/item_acceptor";
import { GameSystemWithFilter } from "../game_system_with_filter";
import { MapChunkView } from "../map_chunk_view";

export class ItemAcceptorSystem extends GameSystemWithFilter {
    constructor(root) {
        super(root, [ItemAcceptorComponent]);
    }

    /**
     * @param {DrawParameters} parameters
     * @param {MapChunkView} chunk
     */
    drawChunk(parameters, chunk) {
        const progress =
            this.root.dynamicTickrate.deltaSeconds *
            2 *
            this.root.hubGoals.getBeltBaseSpeed() *
            globalConfig.itemSpacingOnBelts; // * 2 because its only a half tile

        const contents = chunk.containedEntitiesByLayer.regular;
        for (let i = 0; i < contents.length; ++i) {
            const entity = contents[i];
            const acceptorComp = entity.components.ItemAcceptor;
            if (!acceptorComp) {
                continue;
            }

            const staticComp = entity.components.StaticMapEntity;
            for (
                let animIndex = acceptorComp.itemConsumptionAnimations.length - 1;
                animIndex >= 0;
                --animIndex
            ) {
                const { item, slotIndex, animProgress, direction } = acceptorComp.itemConsumptionAnimations[
                    animIndex
                ];

                if (animProgress > 1) {
                    fastArrayDelete(acceptorComp.itemConsumptionAnimations, animIndex);
                    continue;
                }

                const slotData = acceptorComp.slots[slotIndex];
                const realSlotPos = staticComp.localTileToWorld(slotData.pos);

                if (!chunk.tileSpaceRectangle.containsPoint(realSlotPos.x, realSlotPos.y)) {
                    // Not within this chunk
                    continue;
                }

                const fadeOutDirection = enumDirectionToVector[staticComp.localDirectionToWorld(direction)];
                const finalTile = realSlotPos.subScalars(
                    fadeOutDirection.x * (animProgress / 2 - 0.5),
                    fadeOutDirection.y * (animProgress / 2 - 0.5)
                );

                item.drawItemCenteredClipped(
                    (finalTile.x + 0.5) * globalConfig.tileSize,
                    (finalTile.y + 0.5) * globalConfig.tileSize,
                    parameters,
                    globalConfig.defaultItemDiameter
                );

                acceptorComp.itemConsumptionAnimations[animIndex].animProgress += progress;
            }
        }
    }
}
