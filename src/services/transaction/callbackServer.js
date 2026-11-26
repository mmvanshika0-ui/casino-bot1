const http = require('http');
const { handleDepositCallback } = require('./apironeService');
const logger = require('../../utils/logger');
const { EmbedBuilder } = require('discord.js');
const config = require('../../config/config');

function startCallbackServer(client) {
  const port = process.env.PORT || 3000;

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(404); res.end(); return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const url    = new URL(req.url, `http://localhost`);
        const depositId = url.searchParams.get('deposit_id');
        const userId    = url.searchParams.get('user_id');
        const txData    = JSON.parse(body);

        logger.info(`Apirone callback: deposit=${depositId}`, txData);

        if (!depositId) { res.writeHead(400); res.end('Missing deposit_id'); return; }

        const result = await handleDepositCallback(depositId, txData);

        if (result) {
          // notify user in DM
          try {
            const prisma = client.prisma;
            const user   = await prisma.user.findUnique({ where: { id: userId } });
            if (user) {
              const discordUser = await client.users.fetch(user.discordId);
              const embed = new EmbedBuilder()
                .setColor(config.colors.success)
                .setTitle('✅ Deposit Confirmed')
                .setDescription(`Your deposit has been confirmed and credited to your account!`)
                .addFields(
                  { name: 'Amount',   value: `${result.amountCrypto} ${result.currency.toUpperCase()}`, inline: true },
                  { name: 'Credits',  value: `🪙 ${result.credits.toLocaleString()}`,                  inline: true },
                  { name: 'TX Hash',  value: `\`${result.txHash}\``,                                   inline: false },
                )
                .setTimestamp();
              await discordUser.send({ embeds: [embed] });
            }
          } catch (dmErr) {
            logger.warn('Could not DM user about deposit:', dmErr.message);
          }
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('*ok*');

      } catch (err) {
        logger.error('Callback error:', err);
        res.writeHead(500); res.end(err.message);
      }
    });
  });

  server.listen(port, () => {
    logger.info(`Callback server listening on port ${port}`);
  });
}

module.exports = { startCallbackServer };
