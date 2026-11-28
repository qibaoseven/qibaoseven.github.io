/**
 * 配置存储：用系统 preferences（键值对，等同 SharedPreferences）
 * 直接读写 Api 类的静态字段，UI 层只认 Api 一个真相源。
 */
import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { Api } from './Api';

export class Store {
  private static NAME: string = 'openstu_store';

  static async load(ctx: common.UIAbilityContext): Promise<void> {
    const sp = await preferences.getPreferences(ctx, Store.NAME);
    Api.server = await sp.get('server', 'https://os-stu.netlify.app') as string;
    Api.classId = await sp.get('class_id', '') as string;
    Api.password = await sp.get('password', '') as string;
  }

  static async save(ctx: common.UIAbilityContext, server: string, classId: string,
                    password: string): Promise<void> {
    const sp = await preferences.getPreferences(ctx, Store.NAME);
    await sp.put('server', server.trim());
    await sp.put('class_id', classId.trim());
    await sp.put('password', password);
    await sp.flush();

    Api.server = server.trim();
    Api.classId = classId.trim();
    Api.password = password;
  }
}
