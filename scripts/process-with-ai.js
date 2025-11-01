// scripts/process-with-ai.js — версия с перегенерацией (MadeSimple style)
const { OpenAI } = require('openai');
const fs = require('fs').promises;
const path = require('path');
const ExcelJS = require('exceljs');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 🚀 Используем GPT-4o — точный, стильный, быстро работает
const AI_MODEL = "gpt-4o";

console.log('🚀 Запускаем AI-обработку статей (GPT-4o)...');

async function processArticles() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ Не найден ключ OpenAI API!');
      return;
    }

    const inputPath = path.join(__dirname, '../results/Статьи Дзен/Нарочно не придумаешь/Нарочно не придумаешь_articles.xlsx');
    console.log('📁 Проверяем входной файл...');
    await fs.access(inputPath);
    console.log('✅ Файл найден!');

    // Читаем Excel с оригиналами
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputPath);
    const worksheet = workbook.getWorksheet('Articles');
    const totalArticles = worksheet.rowCount - 1;
    console.log(`📊 Найдено статей: ${totalArticles}`);

    // Создаём папку для результатов
    const outputDir = path.join(__dirname, '../processed');
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'рабочие_статьи_GPT4o.xlsx');

    const newWorkbook = new ExcelJS.Workbook();
    const newWorksheet = newWorkbook.addWorksheet('Рабочие статьи');

    // Настраиваем столбцы
    newWorksheet.columns = [
      { header: '№', key: 'number', width: 5 },
      { header: 'Оригинальный заголовок', key: 'original_title', width: 35 },
      { header: 'Уникальный заголовок', key: 'unique_title', width: 35 },
      { header: 'Оригинальный текст', key: 'original_text', width: 80 },
      { header: 'Уникальный текст', key: 'unique_text', width: 80 },
      { header: 'Ориг. слов', key: 'original_words', width: 12 },
      { header: 'Уник. слов', key: 'unique_words', width: 12 },
      { header: 'Разница', key: 'difference', width: 12 },
      { header: 'Статус', key: 'status', width: 25 }
    ];

    const maxArticles = 4; // Сколько статей обработать за запуск
    let processedCount = 0;

    for (let i = 2; i <= Math.min(worksheet.rowCount, maxArticles + 1); i++) {
      const row = worksheet.getRow(i);
      const originalTitle = row.getCell(1).value;
      const originalText = row.getCell(2).value;

      if (!originalTitle || !originalText) continue;

      const originalWordCount = originalText.split(/\s+/).length;
      console.log(`\n🔍 Обработка статьи: "${originalTitle.substring(0, 50)}..."`);
      console.log(`📏 Объём оригинала: ${originalWordCount} слов`);

      try {
        // === 1. Новый уникальный заголовок ===
        console.log('💡 Генерируем новый заголовок...');

        const titlePrompt = `
Ты — копирайтер, работающий в стиле канала "MadeSimple" (Яндекс Дзен).
Создай новый заголовок в том же ритме, эмоциональном тоне и структуре, что и оригинал.
Можно заменить участников, детали и место действия, но стиль должен остаться прежним.

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

        const uniqueTitle = titleResponse.choices[0].message.content
          .replace(/["']/g, '')
          .trim();

        // === 2. Переписываем текст ===
        console.log('✍️ Переписываем текст с сохранением сюжета...');

        const textPrompt = `
Ты — опытный копирайтер и редактор в духе канала "MadeSimple" (Яндекс Дзен).
Перепиши полностью этот рассказ, сохранив сюжет, эмоции и атмосферу.
Измени имена, детали, но не суть.
Пиши естественно, по-русски, без "мотиваторов" и американских оборотов.
Объем примерно ${originalWordCount} слов.

Оригинальный текст:
"""${originalText}"""

Верни только готовый текст без комментариев.
`;

        // Функция генерации текста (для повторного использования)
        async function generateText(prompt) {
          const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.8,
            max_tokens: 7000
          });
          return response.choices[0].message.content.trim();
        }

        let uniqueText = await generateText(textPrompt);
        let uniqueWordCount = uniqueText.split(/\s+/).length;

        // === 3. Проверка качества ===
        const shortOrBroken =
          !uniqueText ||
          uniqueWordCount < 1000 ||
          uniqueWordCount < originalWordCount * 0.8;

        let regeneration = false;

        if (shortOrBroken) {
          console.log('⚙️ Перегенерация: первая версия слишком короткая или пустая...');
          regeneration = true;
          uniqueText = await generateText(textPrompt);
          uniqueWordCount = uniqueText.split(/\s+/).length;
        }

        // === 4. Подсчёт и лог ===
        const diffPercent = Math.round((uniqueWordCount - originalWordCount) / originalWordCount * 100);
        const volumeStatus = Math.abs(diffPercent) <= 15 ? '✅ Сохранен' : `⚠️ ${diffPercent}%`;
        const finalStatus = regeneration ? '♻️ Перегенерировано' : '✅ Готово';

        console.log(`📊 Итог: ${originalWordCount} → ${uniqueWordCount} слов (${volumeStatus})`);
        console.log(`📝 Новый заголовок: ${uniqueTitle}`);

        // === 5. Запись в Excel и .txt ===
        newWorksheet.addRow({
          number: i - 1,
          original_title: originalTitle,
          unique_title: uniqueTitle,
          original_text: originalText,
          unique_text: uniqueText,
          original_words: originalWordCount,
          unique_words: uniqueWordCount,
          difference: volumeStatus,
          status: finalStatus
        });

        const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, '');
        await fs.writeFile(path.join(outputDir, `${i - 1}_${safeTitle}.txt`), uniqueText, 'utf8');

        processedCount++;
        console.log(`✅ Статья ${i - 1} успешно обработана (${finalStatus}).`);

        await new Promise(resolve => setTimeout(resolve, 2000)); // пауза между запросами

      } catch (error) {
        console.log(`❌ Ошибка при обработке: ${error.message}`);
      }
    }

    // === Сохраняем результат ===
    await newWorkbook.xlsx.writeFile(outputPath);
    console.log('\n🎉 ====== ГОТОВО ======');
    console.log(`📊 Обработано статей: ${processedCount}`);
    console.log(`📁 Файл: ${outputPath}`);

  } catch (error) {
    console.error('💥 Критическая ошибка:', error.message);
  }
}

processArticles();
