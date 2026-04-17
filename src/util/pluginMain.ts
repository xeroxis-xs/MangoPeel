import { Backend} from "./backend";
import { LocalizationManager } from "../i18n/localization";
import { Settings } from "./settings";
import { Config } from "./config";
import { prefStore } from "./perfStore";
import { sleep } from "@decky/ui";



export class PluginManager{
  public static register = async()=>{
    await Config.init();
    await prefStore.init();
    await Backend.init();
    await Settings.init();
    await LocalizationManager.init();
    Backend.reloadConfig();
    Backend.applyConfigs(Settings.toMangoConfigs());

    const savedIndex = Settings.perAppIndex();
    if (savedIndex > 0) {
      setTimeout(async () => {
        await prefStore.trySetSteamIndex(savedIndex, 30);
        Settings.setSettingsIndex(savedIndex);
        Backend.applyConfig(savedIndex, Settings.toMangoConfig(savedIndex));
      }, 3000);
    }
  }

  public static unregister = ()=>{
    Settings.unregister();
  }
}

