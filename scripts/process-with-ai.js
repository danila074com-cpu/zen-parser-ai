// scripts/process-with-ai.js — GPT-4o + DALL·E 3 + 2-этапный рерайт + динамическая обложка
const { OpenAI } = require('openai');
const fs = require('fs').promises;
const path = require('path');
const ExcelJS = require('exceljs');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const AI_MODEL = "gpt-4o";
console.log('🚀 Запускаем AI-обработку статей (GPT-4o, двухэтапный рерайт)...');

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
      { header: 'Перегенераций', key: 'regens', width: 12 },
      { header: 'Статус', key: 'status', width: 20 }
    ];

    let processedCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const maxArticles = 4;

    for (let i = 2; i <= Math.min(worksheet.rowCount, maxArticles + 1); i++) {
      const row = worksheet.getRow(i);
      const originalTitle = row.getCell(1).value;
      const originalText = row.getCell(2).value;
      if (!originalTitle || !originalText) continue;

      const originalWordCount = originalText.split(/\s+/).length;
      console.log(`\n🔍 Обрабатываем статью: "${originalTitle.substring(0, 50)}..."`);
      console.log(`   📏 Объём оригинала: ${originalWordCount} слов`);

      let regenCount = 0;
      let uniqueText = "";

      try {
        // === 1. Новый уникальный заголовок ===
        console.log('   💡 Создаём новый заголовок...');
        const titlePrompt = `
Ты — копирайтер в стиле "MadeSimple" (Яндекс Дзен).
Создай новый эмоциональный заголовок, сохранив смысл и интригу оригинала.
Без англицизмов, хайпа и канцелярита. Добавь живые эмоции и характер.

Оригинальный заголовок:
"${originalTitle}"
Верни только новый заголовок без кавычек.
`;

        const titleResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: titlePrompt }],
          temperature: 0.9,
          max_tokens: 150
        });

        let uniqueTitle = titleResponse.choices[0].message.content.trim();
        totalInputTokens += titleResponse.usage.prompt_tokens;
        totalOutputTokens += titleResponse.usage.completion_tokens;

        // === 2. Переписываем текст в 2 этапа ===
        console.log('   ✍️ Переписываем первую половину...');
        const textHalf1Prompt = `
Ты — опытный копирайтер в духе канала "MadeSimple" (Яндекс Дзен).
Перепиши первую половину рассказа в реалистичном стиле Дзена, сохранив атмосферу и эмоции.
Объём до 1700 слов.

Оригинальный текст:
"""${originalText.slice(0, Math.floor(originalText.length / 2))}"""
`;

        const half1 = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: textHalf1Prompt }],
          temperature: 0.8,
          max_tokens: 4500
        });

        const firstPart = half1.choices[0].message.content.trim();
        totalInputTokens += half1.usage.prompt_tokens;
        totalOutputTokens += half1.usage.completion_tokens;

        console.log('   ✍️ Переписываем продолжение...');
        const textHalf2Prompt = `
Продолжи историю с того момента, где закончилась предыдущая часть.
Сохрани плавность и стиль. Длина финального текста — до 3500 слов.
Оригинальный текст (вторая половина):
"""${originalText.slice(Math.floor(originalText.length / 2))}"""
`;

        const half2 = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: textHalf2Prompt }],
          temperature: 0.8,
          max_tokens: 4500
        });

        const secondPart = half2.choices[0].message.content.trim();
        totalInputTokens += half2.usage.prompt_tokens;
        totalOutputTokens += half2.usage.completion_tokens;

        uniqueText = `${firstPart}\n\n${secondPart}`;

        const uniqueWordCount = uniqueText.split(/\s+/).length;

        if (uniqueWordCount < originalWordCount * 0.6) {
          console.log('   ⚠️ Текст слишком короткий — выполняем однократную перегенерацию...');
          regenCount++;
          const regenResponse = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
              { role: "user", content: `Перепиши текст подробнее, ближе к оригинальному объёму (3500 слов):` },
              { role: "assistant", content: uniqueText }
            ],
            temperature: 0.8,
            max_tokens: 4500
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
        console.log(`   🔁 Перегенераций: ${regenCount}`);

        // === Сохраняем текст ===
        const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, '');
        const textPath = path.join(outputDir, `${i - 1}_${safeTitle}.txt`);
        await fs.writeFile(textPath, uniqueText, 'utf8');

        // === 3. Генерация обложки по сюжету ===
        try {
          console.log('   🎨 Генерируем реалистичную обложку по содержанию...');
          const previewText = uniqueText.split(/\s+/).slice(0, 500).join(' ');
          const imagePrompt = `
Realistic photograph, 1x1 aspect ratio, bright and colorful, cinematic lighting.
Depict a Soviet family scene based on the following story context:
"${previewText}"
Style: USSR 1980s home, expressive emotions (anger, warmth, sorrow, joy depending on context).
Include close-up faces (mother-in-law, daughter, son-in-law, family members).
No text, no yellow background, no modern objects.
`;

          const imageResponse = await openai.images.generate({
            model: "gpt-image-1",
            prompt: imagePrompt,
            size: "1024x1024",
            n: 1
          });

          const imageBase64 = imageResponse.data[0].b64_json;
          const imageBuffer = Buffer.from(imageBase64, "base64");
          const imagePath = path.join(outputDir, `${i - 1}_${safeTitle}.png`);
          await fs.writeFile(imagePath, imageBuffer);
          console.log(`   🖼️ Обложка сохранена: ${imagePath}`);
        } catch (err) {
          console.log(`   ⚠️ Ошибка при генерации обложки: ${err.message}`);
        }

        // === Добавляем строку в Excel ===
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

        processedCount++;
      } catch (err) {
        console.log(`   ❌ Ошибка: ${err.message}`);
      }
    }

    // === Подсчёт стоимости ===
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

  } catch (err) {
    console.error('💥 Критическая ошибка:', err.message);
  }
}

processArticles();
