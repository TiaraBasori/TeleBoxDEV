import { Plugin } from '@utils/pluginBase';
import { exec } from 'child_process';
import { promisify } from 'util';
import { loadPlugins } from '@utils/pluginManager';

const execAsync = promisify(exec);

/**
 * 执行 Shell 命令并输出结果
 */
async function run(command: string) {
  console.log(`\n> ${command}`);
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stdout.trim()) console.log(stdout.trim());
    if (stderr.trim()) console.error(stderr.trim());
  } catch (err: any) {
    console.error(`命令失败: ${command}`);
    console.error(err.stderr || err.message);
  }
}

/**
 * 自动更新项目：拉取 Git 更新 + 安装依赖
 * @param force 是否强制重置为远程 master（丢弃本地改动）
 */
async function update(force = false) {
  console.log('🚀 开始更新项目...\n');

  await run('git fetch --all');

  if (force) {
    console.log('⚠️ 强制回滚到 origin/master...');
    await run('git reset --hard origin/master');
  }

  await run('git pull');

  console.log('\n📦 安装依赖...');
  await run('npm install');

  console.log('\n✅ 更新完成。');
}

const updatePlugin: Plugin = {
    command: 'update',
    description: '更新项目：拉取最新代码并安装依赖',
    commandHandler: async (event) => {
        const args = event.message.message.slice(1).split(' ').slice(1);
        const force = args.includes('--force') || args.includes('-f');
        await update(force);
        await event.message.edit({ text: '项目更新完成！' });
        await loadPlugins(); // 重新加载插件
        console.log('🔄 插件已重新加载。');
    },
};

export default updatePlugin;