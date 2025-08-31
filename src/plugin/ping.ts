import { Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { Api } from "telegram";
import { exec } from "child_process";
import { promisify } from "util";
import { createConnection } from "net";
import { createDirectoryInAssets } from "@utils/pathHelpers";
import Database from "better-sqlite3";
import path from "path";

const execAsync = promisify(exec);

// 数据中心IP地址映射 (参考PagerMaid-Modify)
const DCs = {
  1: "149.154.175.53",  // DC1 Miami
  2: "149.154.167.51",  // DC2 Amsterdam
  3: "149.154.175.100", // DC3 Miami  
  4: "149.154.167.91",  // DC4 Amsterdam
  5: "91.108.56.130"    // DC5 Singapore (PagerMaid IP)
};

// HTML转义函数
function htmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * TCP连接测试 - 类似HTTP ping
 */
async function tcpPing(hostname: string, port: number = 80, timeout: number = 3000): Promise<number> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = createConnection(port, hostname);
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      const end = performance.now();
      socket.end();
      resolve(Math.round(end - start));
    });
    
    function handleError() {
      socket.destroy();
      resolve(-1);
    }
    
    socket.on('timeout', handleError);
    socket.on('error', handleError);
  });
}

/**
 * 系统ICMP ping命令
 */
async function systemPing(target: string, count: number = 3): Promise<{ avg: number; loss: number; output: string }> {
  try {
    const isWindows = process.platform === 'win32';
    const pingCmd = isWindows 
      ? `ping -n ${count} ${target}`
      : `ping -c ${count} ${target}`;
    
    const { stdout, stderr } = await execAsync(pingCmd);
    
    if (stderr) {
      throw new Error(stderr);
    }
    
    // 解析ping结果
    let avgTime = -1;
    let packetLoss = 100;
    
    if (isWindows) {
      // Windows ping输出解析 - 修复中文输出解析
      const avgMatch = stdout.match(/平均 = (\d+)ms|Average = (\d+)ms/);
      const lossMatch = stdout.match(/(\d+)% 丢失|(\d+)% loss/);
      
      if (avgMatch) {
        avgTime = parseInt(avgMatch[1] || avgMatch[2]);
      } else {
        // 如果没有找到平均值，检查是否有时间<1ms的情况
        if (stdout.includes('时间<1ms') || stdout.includes('time<1ms')) {
          avgTime = 0; // 小于1ms显示为0ms
        }
      }
      if (lossMatch) {
        packetLoss = parseInt(lossMatch[1] || lossMatch[2]);
      }
    } else {
      // Linux/macOS ping输出解析
      const avgMatch = stdout.match(/avg\/[^=]+=([0-9.]+)/);
      const lossMatch = stdout.match(/(\d+)% packet loss/);
      
      if (avgMatch) {
        avgTime = Math.round(parseFloat(avgMatch[1]));
      }
      if (lossMatch) {
        packetLoss = parseInt(lossMatch[1]);
      }
    }
    
    return {
      avg: avgTime,
      loss: packetLoss,
      output: stdout
    };
  } catch (error: any) {
    throw new Error(`Ping失败: ${error.message}`);
  }
}

/**
 * 测试所有数据中心延迟 (参考PagerMaid-Modify实现)
 */
async function pingDataCenters(): Promise<string[]> {
  const results: string[] = [];
  const isWindows = process.platform === 'win32';
  
  for (let dc = 1; dc <= 5; dc++) {
    const ip = DCs[dc as keyof typeof DCs];
    try {
      let pingTime = "0";
      
      if (isWindows) {
        // Windows: 使用简化的ping命令
        const { stdout } = await execAsync(`ping -n 1 ${ip}`);
        
        // 提取延迟时间 - 修复PagerMaid的解析问题
        const timeMatch = stdout.match(/时间[<=](\d+)ms|time[<=](\d+)ms/);
        if (timeMatch) {
          pingTime = timeMatch[1] || timeMatch[2] || "0";
        } else if (stdout.includes('时间<1ms') || stdout.includes('time<1ms')) {
          pingTime = "0";
        } else {
          // 从统计信息中提取平均值
          const avgMatch = stdout.match(/平均 = (\d+)ms|Average = (\d+)ms/);
          if (avgMatch) {
            pingTime = avgMatch[1] || avgMatch[2];
          }
        }
      } else {
        // Linux/macOS: 使用awk提取时间
        const { stdout } = await execAsync(
          `ping -c 1 ${ip} | awk -F 'time=' '/time=/ {print $2}' | awk '{print $1}'`
        );
        try {
          pingTime = String(Math.round(parseFloat(stdout.trim())));
        } catch {
          pingTime = "0";
        }
      }
      
      const dcLocation = dc === 1 || dc === 3 ? "Miami" : 
                        dc === 2 || dc === 4 ? "Amsterdam" : "Singapore";
      
      results.push(`🌐 <b>DC${dc} (${dcLocation}):</b> <code>${pingTime}ms</code>`);
      
    } catch (error) {
      const dcLocation = dc === 1 || dc === 3 ? "Miami" : 
                        dc === 2 || dc === 4 ? "Amsterdam" : "Singapore";
      results.push(`🌐 <b>DC${dc} (${dcLocation}):</b> <code>超时</code>`);
    }
  }
  
  return results;
}

/**
 * 解析ping目标
 */
function parseTarget(input: string): { type: 'ip' | 'domain' | 'dc', value: string } {
  // 检查是否为数据中心
  if (/^dc[1-5]$/i.test(input)) {
    const dcNum = parseInt(input.slice(2)) as keyof typeof DCs;
    return { type: 'dc', value: DCs[dcNum] };
  }
  
  // 检查是否为IP地址
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (ipRegex.test(input)) {
    return { type: 'ip', value: input };
  }
  
  // 默认为域名
  return { type: 'domain', value: input };
}

const pingPlugin: Plugin = {
  command: ["ping"],
  description: "🏓 网络延迟测试工具\n\n• .ping - Telegram API延迟\n• .ping <IP/域名> - ICMP ping测试\n• .ping dc1-dc5 - 数据中心延迟\n• .ping all - 所有数据中心延迟",
  cmdHandler: async (msg) => {
    const client = await getGlobalClient();
    
    if (!client) {
      await msg.edit({
        text: "❌ 客户端未初始化",
      });
      return;
    }

    try {
      const args = msg.message.split(' ').slice(1);
      const target = args[0]?.toLowerCase();
      
      // 无参数 - 基础Telegram延迟测试
      if (!target) {
        // 测量 Telegram API 延迟
        const apiStart = Date.now();
        await client.getMe();
        const apiEnd = Date.now();
        const apiLatency = apiEnd - apiStart;

        // 测量消息编辑延迟
        const msgStart = Date.now();
        await msg.edit({
          text: "🏓 Pong!",
        });
        const msgEnd = Date.now();
        const msgLatency = msgEnd - msgStart;

        // 显示结果
        await msg.edit({
          text: `🏓 <b>Pong!</b>

📡 <b>API延迟:</b> <code>${apiLatency}ms</code>
✏️ <b>消息延迟:</b> <code>${msgLatency}ms</code>

⏰ <i>${new Date().toLocaleString('zh-CN')}</i>`,
          parseMode: "html",
        });
        return;
      }
      
      // 所有数据中心测试
      if (target === 'all' || target === 'dc') {
        await msg.edit({
          text: "🔍 正在测试所有数据中心延迟...",
        });
        
        const dcResults = await pingDataCenters();
        
        await msg.edit({
          text: `🌐 <b>Telegram数据中心延迟</b>\n\n${dcResults.join('\n')}\n\n⏰ <i>${new Date().toLocaleString('zh-CN')}</i>`,
          parseMode: "html",
        });
        return;
      }
      
      // 帮助信息
      if (target === 'help' || target === 'h') {
        await msg.edit({
          text: `🏓 <b>Ping工具使用说明</b>\n\n<b>基础用法:</b>\n• <code>.ping</code> - Telegram延迟测试\n• <code>.ping all</code> - 所有数据中心延迟\n\n<b>网络测试:</b>\n• <code>.ping 8.8.8.8</code> - IP地址ping\n• <code>.ping google.com</code> - 域名ping\n• <code>.ping dc1</code> - 指定数据中心\n\n<b>数据中心:</b>\n• DC1-DC5: 分别对应不同地区服务器\n\n💡 <i>支持ICMP和TCP连接测试</i>`,
          parseMode: "html",
        });
        return;
      }
      
      // 网络目标测试
      await msg.edit({
        text: `🔍 正在测试 <code>${htmlEscape(target)}</code>...`,
        parseMode: "html",
      });
      
      const parsed = parseTarget(target);
      const testTarget = parsed.value;
      
      // 执行多种测试
      const results: string[] = [];
      
      // ICMP Ping测试
      try {
        const pingResult = await systemPing(testTarget, 3);
        if (pingResult.avg > 0) {
          results.push(`🏓 <b>ICMP Ping:</b> <code>${pingResult.avg}ms</code> (丢包: ${pingResult.loss}%)`);
        } else {
          results.push(`🏓 <b>ICMP Ping:</b> <code>超时/失败</code>`);
        }
      } catch (error: any) {
        results.push(`🏓 <b>ICMP Ping:</b> <code>错误</code>`);
      }
      
      // TCP连接测试 (HTTP端口)
      try {
        const tcpResult = await tcpPing(testTarget, 80, 5000);
        if (tcpResult > 0) {
          results.push(`🌐 <b>TCP连接 (80):</b> <code>${tcpResult}ms</code>`);
        } else {
          results.push(`🌐 <b>TCP连接 (80):</b> <code>超时/拒绝</code>`);
        }
      } catch (error) {
        // TCP测试失败不显示错误，因为很多服务器不开放80端口
      }
      
      // HTTPS端口测试
      try {
        const httpsResult = await tcpPing(testTarget, 443, 5000);
        if (httpsResult > 0) {
          results.push(`🔒 <b>TCP连接 (443):</b> <code>${httpsResult}ms</code>`);
        }
      } catch (error) {
        // HTTPS测试失败不显示错误
      }
      
      if (results.length === 0) {
        results.push(`❌ 所有测试均失败，目标可能不可达`);
      }
      
      const targetType = parsed.type === 'dc' ? '数据中心' : 
                        parsed.type === 'ip' ? 'IP地址' : '域名';
      
      await msg.edit({
        text: `🎯 <b>${targetType}延迟测试</b>\n<code>${htmlEscape(target)}</code> → <code>${htmlEscape(testTarget)}</code>\n\n${results.join('\n')}\n\n⏰ <i>${new Date().toLocaleString('zh-CN')}</i>`,
        parseMode: "html",
      });
      
    } catch (error: any) {
      await msg.edit({
        text: `❌ 测试失败: ${htmlEscape(error.message)}`,
        parseMode: "html",
      });
    }
  },
};

export default pingPlugin;
