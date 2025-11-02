// scripts/process-with-ai.js — версия под GPT-4o (MadeSimple style, с учетом стоимости и 1 перегенерацией)
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
      { header: 'Статус', key: 'status', width: 20 }
    ];

    const maxArticles = 4;
    let processedCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let i = 2; i <= Math.min(worksheet.rowCount, maxArticles + 1); i++) {
      const row = worksheet.getRow(i);
      const originalTitle = row.getCell(1).value;
      const originalText = row.getCell(2).value;
      if (!originalTitle || !originalText) continue;

      const originalWordCount = originalText.split(/\s+/).length;
      console.log(`\n🔍 Обрабатываем статью: "${originalTitle.substring(0, 50)}..."`);
      console.log(`   📏 Объём оригинала: ${originalWordCount} слов`);

      try {
        // === 1. Новый уникальный заголовок ===
        console.log('   💡 Генерируем новый заголовок...');

        const titlePrompt = `
Ты — копирайтер в стиле "MadeSimple" (Яндекс Дзен).
Создай НОВЫЙ заголовок, сохранив эмоциональный ритм и структуру оригинала.
Измени детали, но не тип интриги. Без западных имён и мотивов успеха.

Оригинальный заголовок:
"${originalTitle}"

Верни только новый заголовок без кавычек.
        `;

        const titleResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: titlePrompt }],
          temperature: 0.9,
          max_tokens: 120
        });

        const uniqueTitle = titleResponse.choices[0].message.content.replace(/["']/g, '').trim();
        totalInputTokens += titleResponse.usage.prompt_tokens;
        totalOutputTokens += titleResponse.usage.completion_tokens;

        // === 2. Переписываем текст ===
        console.log('   ✍️ Переписываем текст...');

        const textPrompt = `
Ты — опытный копирайтер и редактор в духе канала "MadeSimple" (Яндекс Дзен).
Перепиши этот рассказ, сохранив сюжет, эмоции и атмосферу, но полностью обновив формулировки.
Измени имена, диалоги и детали, но не смысл.
Оставь русскую атмосферу, бытовые реалии, живые диалоги и естественный ритм повествования.
Пиши в реалистичном стиле Дзена.
Если текст слишком длинный — можешь сжать его, оставив ключевые сцены и эмоции.
Итоговый объём: примерно 3000–3500 слов.

Оригинальный текст:
"""${originalText}"""

Верни только готовый текст без комментариев и заголовков.
        `;

        const textResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: textPrompt }],
          temperature: 0.8,
          max_tokens: 2000
        });

        let uniqueText = textResponse.choices[0].message.content.trim();
        totalInputTokens += textResponse.usage.prompt_tokens;
        totalOutputTokens += textResponse.usage.completion_tokens;

        // === Проверка объёма и 1 перегенерация ===
        const uniqueWordCount = uniqueText.split(/\s+/).length;
        if (uniqueWordCount < originalWordCount * 0.4) {
          console.log('   ⚠️ Текст слишком короткий — выполняем одну перегенерацию...');
          const regenResponse = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
              { role: "user", content: textPrompt },
              { role: "assistant", content: uniqueText },
              { role: "user", content: "Перепиши текст заново, сделай его подробнее и ближе по объёму к оригиналу (до 3500 слов)." }
            ],
            temperature: 0.8,
            max_tokens: 2000
          });
          uniqueText = regenResponse.choices[0].message.content.trim();
          totalInputTokens += regenResponse.usage.prompt_tokens;
          totalOutputTokens += regenResponse.usage.completion_tokens;
        }

        const finalWordCount = uniqueText.split(/\s+/).length;
        const diffPercent = Math.round((finalWordCount - originalWordCount) / originalWordCount * 100);
        const volumeStatus = Math.abs(diffPercent) <= 20 ? '✅ Сохранен' : `⚠️ ${diffPercent}%`;

        console.log(`   📊 Итог: ${originalWordCount} → ${finalWordCount} слов (${volumeStatus})`);
        console.log(`   📝 Новый заголовок: ${uniqueTitle}`);

        newWorksheet.addRow({
          number: i - 1,
          original_title: originalTitle,
          unique_title: uniqueTitle,
          original_text: originalText,
          unique_text: uniqueText,
          original_words: originalWordCount,
          unique_words: finalWordCount,
          difference: volumeStatus,
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

    // === Подсчёт стоимости ===
    const totalTokens = totalInputTokens + totalOutputTokens;
    const inputCost = (totalInputTokens / 1_000_000) * 2.50;   // $2.50 за 1M input tokens (GPT-4o)
    const outputCost = (totalOutputTokens / 1_000_000) * 10.00; // $10.00 за 1M output tokens
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

  } catch (error) {
    console.error('💥 Критическая ошибка:', error.message);
  }
}

processArticles();
