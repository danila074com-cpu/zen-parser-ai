// scripts/process-with-ai.js — GPT-4o (MadeSimple style, с логом перегенераций и улучшенным балансом цена/качество)
const { OpenAI } = require('openai');
const fs = require('fs').promises;
const path = require('path');
const ExcelJS = require('exceljs');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const AI_MODEL = "gpt-4o";
console.log('🚀 Запускаем AI-обработку статей (GPT-4o)...');

async function processArticles() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ Не найден ключ OpenAI API!');
      return;
    }

    const inputPath = path.join(__dirname, '../results/Статьи Дзен/Нарочно не придумаешь/Нарочно не придумаешь_articles.xlsx');
    await fs.access(inputPath);
    console.log('✅ Файл найден!');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputPath);
    const worksheet = workbook.getWorksheet('Articles');
    const totalArticles = worksheet.rowCount - 1;
    console.log(`📊 Найдено статей: ${totalArticles}`);

    const outputDir = path.join(__dirname, '../processed');
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'рабочие_статьи_GPT4o.xlsx');

    const newWorkbook = new ExcelJS.Workbook();
    const newWorksheet = newWorkbook.addWorksheet('Рабочие статьи');

    newWorksheet.columns = [
      { header: '№', key: 'number', width: 5 },
      { header: 'Оригинальный заголовок', key: 'original_title', width: 35 },
      { header: 'Уникальный заголовок', key: 'unique_title', width: 35 },
      { header: 'Оригинальный текст', key: 'original_text', width: 80 },
      { header: 'Уникальный текст', key: 'unique_text', width: 80 },
      { header: 'Ориг. слов', key: 'original_words', width: 12 },
      { header: 'Уник. слов', key: 'unique_words', width: 12 },
      { header: 'Разница', key: 'difference', width: 12 },
      { header: 'Перегенерации', key: 'regens', width: 15 },
      { header: 'Статус', key: 'status', width: 20 }
    ];

    const maxArticles = 4;
    let processedCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTitleRegens = 0;
    let totalTextRegens = 0;

    for (let i = 2; i <= Math.min(worksheet.rowCount, maxArticles + 1); i++) {
      const row = worksheet.getRow(i);
      const originalTitle = row.getCell(1).value;
      const originalText = row.getCell(2).value;
      if (!originalTitle || !originalText) continue;

      const originalWordCount = originalText.split(/\s+/).length;
      console.log(`\n🔍 Обрабатываем статью: "${originalTitle.substring(0, 50)}..."`);
      console.log(`   📏 Объём оригинала: ${originalWordCount} слов`);

      let regenCount = 0;

      try {
        // === 1. Новый уникальный заголовок ===
        console.log('   💡 Генерируем новый заголовок...');
        const previewText = originalText.slice(0, 300).replace(/\s+/g, ' ');

        const titlePrompt = `
Ты — талантливый копирайтер в стиле канала "MadeSimple" (Яндекс Дзен).
Создай эмоциональный, интригующий, но естественный ЗАГОЛОВОК к рассказу.
Сохрани структуру "— фраза, — сказал(а) ..." или близкую к ней.
Заголовок должен передавать конфликт, эмоцию, внутреннее напряжение.
Не используй кликбейт, восклицательные знаки подряд или "мотивационные" клише.
Не упоминай даты, хэштеги и имена известных людей.

📘 Оригинальный заголовок:
"${originalTitle}"

📜 Краткий контекст рассказа:
"${previewText}"

Примеры хороших заголовков:
— Забери свою подачку. Мне противно её держать, — сказала свекровь и развернулась.
— Ты ведь знала, что он женат, — спокойно сказала сестра.
— Я тянула всё на себе, а в ответ услышала: "Ты же просто секретарша".
— Мы похоронили маму, а на следующий день свекровь сказала: "Теперь ты свободна".

Верни только новый заголовок без кавычек.
        `;

        const titleResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: titlePrompt }],
          temperature: 0.7,
          max_tokens: 150
        });

        let uniqueTitle = titleResponse.choices[0].message.content.replace(/["']/g, '').trim();
        totalInputTokens += titleResponse.usage.prompt_tokens || 0;
        totalOutputTokens += titleResponse.usage.completion_tokens || 0;

        // Проверка заголовка — при необходимости одна перегенерация
        if (!/[—–-].+сказ|усмех|восклик|замет|ответ|проговор/i.test(uniqueTitle)) {
          console.log('   ⚠️ Заголовок без эмоции — выполняем перегенерацию...');
          regenCount++;
          totalTitleRegens++;
          const regenTitleResponse = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
              { role: "user", content: titlePrompt },
              { role: "assistant", content: uniqueTitle },
              { role: "user", content: "Перепиши заголовок, добавь эмоцию или диалоговую форму, как в стиле MadeSimple." }
            ],
            temperature: 0.8,
            max_tokens: 150
          });
          uniqueTitle = regenTitleResponse.choices[0].message.content.replace(/["']/g, '').trim();
          totalInputTokens += regenTitleResponse.usage.prompt_tokens || 0;
          totalOutputTokens += regenTitleResponse.usage.completion_tokens || 0;
        }

        // === 2. Переписываем текст ===
        console.log('   ✍️ Переписываем текст...');
        const textPrompt = `
Ты — опытный копирайтер и редактор в духе канала "MadeSimple" (Яндекс Дзен).
Перепиши этот рассказ, сохранив сюжет, эмоции и атмосферу, но полностью обновив формулировки.
Измени имена, диалоги и бытовые детали, но не смысл.
Оставь русскую атмосферу, реалистичные сцены и живые диалоги.
Объем около 3500 слов, если текст был длиннее — можно немного сократить, но не сильно.
Пиши в естественном ритме Дзена, без излишней драматизации и клише.

Оригинальный текст:
"""${originalText}"""

Верни только готовый текст без комментариев и заголовков.
        `;

        const textResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: textPrompt }],
          temperature: 0.8,
          max_tokens: 2500
        });

        let uniqueText = textResponse.choices[0].message.content.trim();
        totalInputTokens += textResponse.usage.prompt_tokens || 0;
        totalOutputTokens += textResponse.usage.completion_tokens || 0;

        const uniqueWordCount = uniqueText.split(/\s+/).length;
        if (uniqueWordCount < originalWordCount * 0.5) {
          console.log('   ⚠️ Текст слишком короткий — выполняем одну перегенерацию...');
          regenCount++;
          totalTextRegens++;
          const regenResponse = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
              { role: "user", content: textPrompt },
              { role: "assistant", content: uniqueText },
              { role: "user", content: "Сделай текст более подробным, ближе к 3500 словам." }
            ],
            temperature: 0.8,
            max_tokens: 2500
          });
          uniqueText = regenResponse.choices[0].message.content.trim();
          totalInputTokens += regenResponse.usage.prompt_tokens || 0;
          totalOutputTokens += regenResponse.usage.completion_tokens || 0;
        }

        const finalWordCount = uniqueText.split(/\s+/).length;
        const diffPercent = Math.round((finalWordCount - originalWordCount) / originalWordCount * 100);
        const volumeStatus = Math.abs(diffPercent) <= 20 ? '✅ Сохранен' : `⚠️ ${diffPercent}%`;

        console.log(`   📊 Итог: ${originalWordCount} → ${finalWordCount} слов (${volumeStatus})`);
        console.log(`   📝 Новый заголовок: ${uniqueTitle}`);
        console.log(`   🔁 Перегенераций: ${regenCount}`);

        newWorksheet.addRow({
          number: i - 1,
          original_title: originalTitle,
          unique_title: uniqueTitle,
          original_text: originalText,
          unique_text: uniqueText,
          original_words: originalWordCount,
          unique_words: finalWordCount,
          difference: volumeStatus,
          regens: regenCount,
          status: '✅ Готово'
        });

        const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, '');
        await fs.writeFile(path.join(outputDir, `${i - 1}_${safeTitle}.txt`), uniqueText, 'utf8');

        processedCount++;
        console.log('   ✅ Статья успешно обработана.');
        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (error) {
        console.log(`   ❌ Ошибка: ${error.message}`);
      }
    }

    // === Расходы и сводка ===
    const inputCost = (totalInputTokens / 1_000_000) * 2.50;
    const outputCost = (totalOutputTokens / 1_000_000) * 10.00;
    const totalCost = inputCost + outputCost;
    const avgCost = processedCount ? totalCost / processedCount : 0;

    await newWorkbook.xlsx.writeFile(outputPath);

    console.log('\n🎉 ====== ГОТОВО ======');
    console.log(`📊 Обработано статей: ${processedCount}`);
    console.log(`📁 Файл: ${outputPath}`);
    console.log('💰 ====== РАСХОДЫ ======');
    console.log(`🔹 Входные токены: ${totalInputTokens.toLocaleString()} (~$${inputCost.toFixed(4)})`);
    console.log(`🔹 Выходные токены: ${totalOutputTokens.toLocaleString()} (~$${outputCost.toFixed(4)})`);
    console.log(`💵 Итого: ~$${totalCost.toFixed(4)} (≈ $${avgCost.toFixed(4)} за статью)`);
    console.log('🔁 ====== ПЕРЕГЕНЕРАЦИИ ======');
    console.log(`   Заголовков: ${totalTitleRegens}`);
    console.log(`   Текстов: ${totalTextRegens}`);
    console.log(`   Всего: ${totalTitleRegens + totalTextRegens}`);

  } catch (error) {
    console.error('💥 Критическая ошибка:', error.message);
  }
}

processArticles();
