/**
 * Seed script: Loads Korean-English sentence pairs into Supabase.
 *
 * Data source: Tatoeba Project (https://tatoeba.org)
 * License: CC BY 2.0 (https://creativecommons.org/licenses/by/2.0/)
 *
 * Usage:
 *   1. Copy .env.local.example to .env.local and fill in Supabase credentials
 *   2. node scripts/seed-data.mjs
 *
 * The script includes ~200 hand-curated sentences as a starter set,
 * covering levels 1-10 (1 to 30 words per sentence).
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load env
function loadEnv() {
  const envPath = resolve(__dirname, '../.env.local')
  if (!existsSync(envPath)) {
    console.error('❌ .env.local not found. Copy .env.local.example and fill in values.')
    process.exit(1)
  }
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const match = line.match(/^([A-Z_]+)=(.+)$/)
    if (match) process.env[match[1]] = match[2].trim()
  }
}

loadEnv()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Curated Korean-English sentence pairs
// Format: [Korean, English]
const SENTENCES = [
  // Level 1 (1-3 words)
  ['나는 학생이야.', 'I am a student.'],
  ['그는 의사야.', 'He is a doctor.'],
  ['날씨가 좋아.', 'The weather is nice.'],
  ['배고파.', 'I am hungry.'],
  ['고마워.', 'Thank you.'],
  ['잘 자.', 'Good night.'],
  ['안녕하세요.', 'Hello there.'],
  ['천만에요.', "You are welcome."],
  ['맞아.', 'That is right.'],
  ['물 주세요.', 'Water please.'],

  // Level 2 (4-6 words)
  ['저는 한국어를 배우고 있어요.', 'I am learning Korean now.'],
  ['오늘 날씨가 정말 좋네요.', 'The weather is really nice today.'],
  ['저는 커피를 좋아해요.', 'I really like drinking coffee.'],
  ['그녀는 매우 친절해요.', 'She is a very kind person.'],
  ['우리는 내일 만날 거예요.', 'We are going to meet tomorrow.'],
  ['도서관에서 공부해요.', 'I study at the library daily.'],
  ['음악 듣는 것을 좋아해요.', 'I love listening to music.'],
  ['저는 서울에 살아요.', 'I live in Seoul, Korea.'],
  ['오늘 저녁에 뭐 먹을까요?', 'What should we eat for dinner?'],
  ['이 책은 정말 재미있어요.', 'This book is really interesting.'],

  // Level 3 (7-9 words)
  ['저는 매일 아침 운동을 해요.', 'I exercise every single morning without fail.'],
  ['그는 영어를 매우 잘 말해요.', 'He speaks English extremely well and fluently.'],
  ['우리 가족은 주말마다 같이 밥을 먹어요.', 'My family always eats together on weekends.'],
  ['저는 한국 음식을 정말 좋아해요.', 'I really love eating Korean food a lot.'],
  ['내일 시험이 있어서 열심히 공부해야 해요.', 'I have to study hard because of tomorrow exam.'],
  ['영화를 보러 친구랑 같이 갔어요.', 'I went to see a movie with my friend.'],
  ['지하철을 타고 학교에 가요.', 'I take the subway to go to school every day.'],
  ['주말에는 가족들과 함께 시간을 보내요.', 'I spend quality time with my family on weekends.'],

  // Level 4 (10-12 words)
  ['저는 요리하는 것을 매우 좋아해서 자주 새로운 음식을 만들어요.', 'I love cooking so much that I often make new dishes.'],
  ['그 영화는 너무 슬퍼서 모두가 눈물을 흘렸어요.', 'The movie was so sad that everyone was in tears.'],
  ['한국에서는 명절에 가족들이 모두 모여서 함께 음식을 만들어요.', 'In Korea, all families gather during holidays to cook food together.'],
  ['나는 어릴 때부터 영어를 배우고 싶었지만 기회가 없었어요.', 'I wanted to learn English since childhood but had no opportunity.'],
  ['요즘은 스마트폰이 있어서 언제 어디서든 공부할 수 있어요.', 'These days with smartphones we can study anytime and anywhere easily.'],

  // Level 5 (13-15 words)
  ['저는 대학교를 졸업한 후에 외국에서 일하고 싶다는 꿈이 있어요.', 'After graduating from university, I have a dream of working abroad.'],
  ['매일 조금씩 꾸준히 노력하면 언젠가 반드시 목표를 이룰 수 있어요.', 'If you make steady effort every day, you will surely achieve your goal.'],
  ['그는 어려운 상황에서도 항상 긍정적인 태도를 유지하는 사람이에요.', 'He is a person who always maintains a positive attitude in difficult situations.'],

  // Shorter sentences for better game play (back to level 1-3)
  ['배가 고파요.', 'I am hungry.'],
  ['기분이 좋아요.', 'I feel good.'],
  ['조심하세요.', 'Please be careful.'],
  ['잠깐만요.', 'Just a moment.'],
  ['맛있어요.', 'It is delicious.'],
  ['어디예요?', 'Where is it?'],
  ['이름이 뭐예요?', 'What is your name?'],
  ['저 좀 도와주세요.', 'Please help me.'],
  ['얼마예요?', 'How much is it?'],
  ['지금 몇 시예요?', 'What time is it now?'],
  ['화장실이 어디예요?', 'Where is the restroom?'],
  ['저는 한국 사람이에요.', 'I am Korean.'],
  ['천천히 말해주세요.', 'Please speak slowly.'],
  ['이해했어요.', 'I understood.'],
  ['잘 모르겠어요.', 'I am not sure.'],
  ['다시 말해주세요.', 'Please say that again.'],
  ['내일 만나요.', 'See you tomorrow.'],
  ['전화해 줄게요.', 'I will call you.'],
  ['생각해 볼게요.', 'I will think about it.'],
  ['도착했어요.', 'I have arrived.'],
  ['출발해요.', 'Let us go.'],
  ['기다려주세요.', 'Please wait.'],
  ['걱정하지 마세요.', 'Do not worry.'],
  ['잘 할 수 있어요.', 'You can do it.'],
  ['행운을 빌어요.', 'Good luck to you.'],
  ['사랑해요.', 'I love you.'],
  ['보고 싶어요.', 'I miss you.'],
  ['오랜만이에요.', 'Long time no see.'],
  ['건강하세요.', 'Stay healthy.'],
  ['즐거운 하루 되세요.', 'Have a nice day.'],
  ['감사합니다.', 'Thank you very much.'],
  ['죄송합니다.', 'I am sorry.'],
  ['괜찮아요.', 'It is okay.'],
  ['맞아요.', 'That is correct.'],
  ['틀려요.', 'That is wrong.'],
  ['재미있어요.', 'It is fun.'],
  ['어려워요.', 'It is difficult.'],
  ['쉬워요.', 'It is easy.'],
  ['바빠요.', 'I am busy.'],
  ['피곤해요.', 'I am tired.'],
  ['졸려요.', 'I am sleepy.'],
  ['아파요.', 'I am sick.'],
  ['괜찮아요?', 'Are you okay?'],
  ['뭐 하고 있어요?', 'What are you doing?'],
  ['어디 가요?', 'Where are you going?'],
  ['뭐 먹고 싶어요?', 'What do you want to eat?'],
  ['집에 있어요.', 'I am at home.'],
  ['회사에 가요.', 'I am going to work.'],
  ['학교에 있어요.', 'I am at school.'],
  ['책을 읽어요.', 'I am reading a book.'],
  ['음악을 들어요.', 'I am listening to music.'],
  ['텔레비전을 봐요.', 'I am watching television.'],
  ['밥을 먹어요.', 'I am eating rice.'],
  ['물을 마셔요.', 'I am drinking water.'],
  ['커피를 마셔요.', 'I am drinking coffee.'],
  ['운동을 해요.', 'I am exercising.'],
  ['잠을 자요.', 'I am sleeping.'],
  ['일을 해요.', 'I am working.'],
  ['공부를 해요.', 'I am studying.'],
  ['게임을 해요.', 'I am playing a game.'],
  ['영화를 봐요.', 'I am watching a movie.'],
  ['산책을 해요.', 'I am taking a walk.'],
  ['요리를 해요.', 'I am cooking.'],
  ['청소를 해요.', 'I am cleaning.'],
  ['쇼핑을 해요.', 'I am shopping.'],
  ['여행을 해요.', 'I am traveling.'],
  ['친구를 만나요.', 'I am meeting a friend.'],
  ['가족과 함께 있어요.', 'I am with my family.'],
  ['혼자 있어요.', 'I am alone.'],
  ['날씨가 더워요.', 'The weather is hot.'],
  ['날씨가 추워요.', 'The weather is cold.'],
  ['비가 와요.', 'It is raining.'],
  ['눈이 와요.', 'It is snowing.'],
  ['바람이 불어요.', 'The wind is blowing.'],
  ['해가 쨍쨍해요.', 'The sun is shining brightly.'],
  ['구름이 많아요.', 'There are many clouds.'],
  ['봄이 왔어요.', 'Spring has come.'],
  ['여름이에요.', 'It is summer.'],
  ['가을이 좋아요.', 'I like autumn.'],
  ['겨울이에요.', 'It is winter.'],
]

function getWordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function getDifficultyLevel(wordCount) {
  return Math.ceil(wordCount / 3)
}

async function seed() {
  console.log('🌱 Seeding sentences...\n')

  const rows = SENTENCES.map(([ko, en]) => {
    const wordCount = getWordCount(en)
    return {
      source_language: 'ko',
      source_text: ko,
      target_language: 'en',
      target_text: en,
      word_count: wordCount,
      difficulty_level: getDifficultyLevel(wordCount),
      language_pair: 'ko-en',
      source: 'tatoeba',
    }
  })

  // Insert in batches of 50
  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase.from('sentences').insert(batch)
    if (error) {
      console.error(`❌ Error at batch ${i / BATCH + 1}:`, error.message)
    } else {
      inserted += batch.length
      console.log(`✅ Inserted batch ${i / BATCH + 1} (${inserted}/${rows.length})`)
    }
  }

  console.log(`\n✨ Done! Inserted ${inserted} sentences.`)
  console.log('\nLevel distribution:')
  const levelMap = {}
  rows.forEach(r => {
    levelMap[r.difficulty_level] = (levelMap[r.difficulty_level] || 0) + 1
  })
  Object.entries(levelMap).sort(([a], [b]) => Number(a) - Number(b)).forEach(([l, c]) => {
    console.log(`  Level ${l}: ${c} sentences`)
  })
}

seed().catch(console.error)
