import { BC_ItemsToItemBundles, SendAction, addCustomEffect, getCharacter, getRandomInt, isBind, isBody, isCloth, isCosplay, isGenitals, isHair, isPronouns, isSkin, removeCustomEffect, settingsSave, waitFor } from "utils";
import { BaseState, StateRestrictions } from "./BaseState";
import { StateModule } from "Modules/states";
import { PolymorphConfig, PolymorphOption } from "Settings/Models/magic";

export class PolymorphedState extends BaseState {
    static CleanItemCode(code: string): string {
        let items = JSON.parse(LZString.decompressFromBase64(code)) as ItemBundle[];
        if (!items)
            return code;
        items = items.filter(item => {
            let asset = AssetGet(Player.AssetFamily, item.Group, item.Name);
            if (!asset)
                return false;
            return isCosplay(asset) || 
                isBody(asset) ||
                isHair(asset) ||
                isSkin(asset) ||
                isGenitals(asset);
        });
        return LZString.compressToBase64(JSON.stringify(items));
    }

    Type: LSCGState = "polymorphed";

    Icon(C: OtherCharacter): string {
        return "Icons/Horse.png";
    }
    Label(C: OtherCharacter): string {
        return "Polymorphed";
    }

    constructor(state: StateModule) {
        super(state);
        this.Restrictions.Wardrobe = "true";
    }

    storedOutfitKey: string = "stored";
    get StoredOutfit(): ItemBundle[] | undefined {
        let ext = this.config.extensions[this.storedOutfitKey];
        if (!ext) return undefined;
        try {
            return JSON.parse(LZString.decompressFromBase64(ext));
        }
        catch {
            return undefined;
        }
    }

    SetStoredOutfit() {
        this.config.extensions[this.storedOutfitKey] = LZString.compressToBase64(JSON.stringify(BC_ItemsToItemBundles(Player.Appearance)));
        settingsSave();
    }

    ClearStoredOutfit() {
        delete this.config.extensions[this.storedOutfitKey];
        settingsSave();
    }

    DoChange(asset: Asset | null, config: PolymorphConfig): boolean {
        if (!asset)
            return false;
        
        let allow = config.IncludeCosplay && isCosplay(asset);
        allow ||= config.IncludeAllBody && isBody(asset);
        allow ||= config.IncludeHair && isHair(asset);
        allow ||= config.IncludeSkin && isSkin(asset);
        allow ||= config.IncludeGenitals && isGenitals(asset);
        
        if ((isGenitals(asset) && !Player?.LSCG?.MagicModule?.allowChangeGenitals) ||
            (isPronouns(asset) && !Player?.LSCG?.MagicModule?.allowChangePronouns))
            allow = false;

        return allow;
    }

    skinColorChangeOnly: string[] = [
        "BodyUpper",
        "BodyLower",
        "Mouth"
    ]

    StripCharacter(skipStore: boolean, config: PolymorphConfig, newList: ItemBundle[] = []) {
        if (!skipStore && !this.StoredOutfit)
            this.SetStoredOutfit();

        const cosplayBlocked = Player.OnlineSharedSettings?.BlockBodyCosplay ?? true;
        let appearance = Player.Appearance;
        for (let i = appearance.length - 1; i >= 0; i--) {
            const asset = appearance[i].Asset;
            if (this.DoChange(asset, config)) {
                let newItem = newList.find(x => x.Group == asset.Group.Name);
                if (!config.IncludeAllBody && config.IncludeSkin && 
                    !!newItem && 
                    this.skinColorChangeOnly.indexOf(asset.Group.Name) > -1) {
                    // Special handling for simple color change.
                    if (asset.Group.Name != "Mouth" || (!!newItem && !!newItem.Color && newItem.Color != "Default"))
                        appearance[i].Color = newItem.Color;
                }
                else if (newList.length == 0 || newList.some(x => x.Group == asset.Group.Name))
                    appearance.splice(i, 1);
            }
        }
    }

    Apply(outfit: PolymorphConfig, memberNumber?: number | undefined, duration?: number,  emote?: boolean | undefined): BaseState {
        try{
            let outfitList = JSON.parse(LZString.decompressFromBase64(outfit.Code)) as ItemBundle[];
            if (!!outfitList && typeof outfitList == "object") {
                this.StripCharacter(false, outfit, outfitList);
                this.WearMany(outfitList, outfit);
                super.Activate(memberNumber, duration, emote);
            }
        }
        catch {
            console.warn("error parsing outfitcode in PolymorphedState: " + outfit.Code);
        }
        return this;
    }

    Recover(emote?: boolean | undefined): BaseState {
        super.Recover();
        if (!!this.StoredOutfit) {
            this.StripCharacter(true, <PolymorphConfig>{IncludeCosplay: true, IncludeAllBody: true});
            this.WearMany(this.StoredOutfit, <PolymorphConfig>{IncludeCosplay: true, IncludeAllBody: true}, true);
            this.ClearStoredOutfit();
        }
        return this;
    }

    WearMany(items: ItemBundle[], config: PolymorphConfig, isRestore: boolean = false) {
        items.forEach(item => {
            let asset = AssetGet(Player.AssetFamily, item.Group, item.Name);
            if (!!asset && this.DoChange(asset, config)) {
                //let groupBlocked = InventoryGroupIsBlockedForCharacter(Player, asset.Group.Name);
                let isBlocked = InventoryBlockedOrLimited(Player, {Asset: asset})
                let isRoomDisallowed = !InventoryChatRoomAllow(asset?.Category ?? []);

                let isSkinColorChangeOnly = !config.IncludeAllBody && config.IncludeSkin && this.skinColorChangeOnly.indexOf(asset.Group.Name) > -1;
                if (isRestore || !(isBlocked || isRoomDisallowed || isSkinColorChangeOnly)) {
                    let newItem = InventoryWear(Player, item.Name, item.Group, item.Color, item.Difficulty, -1, item.Craft, false);
                    if (!!newItem && !!item.Property)
                        newItem.Property = item.Property;
                }
            }
        });
        ChatRoomCharacterUpdate(Player);
    }

    Init(): void {}

    RoomSync(): void {}

    SpeechBlock(): void {}
}