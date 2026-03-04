'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, MessageSquare, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

// Mock chapter content
const CHAPTERS_DATA: Record<string, { title: string; content: string }> = {
  'ch1': {
    title: 'Introduction: The Extent and Military Force of the Roman Empire',
    content: `In the second century of the Christian era, the empire of Rome comprehended the fairest part of the earth, and the most civilized portion of mankind. The frontiers of that extensive monarchy were guarded by ancient renown and disciplined valor. The gentle but powerful influence of laws and manners had gradually cemented the union of the provinces. Their peaceful inhabitants enjoyed and abused the advantages of wealth and luxury. The image of a free constitution was preserved with decent reverence: the Roman senate appeared to possess the sovereign authority, and devolved on the emperors all the executive powers of government.

During a happy period of more than fourscore years, the public administration was conducted by principles of justice and moderation; or at least, the errors and vices of bad princes were compensated, in some measure, by the wisdom and virtue of their predecessors and successors. It is the purpose of this work to relate the most important circumstances of its decline and fall; a revolution which will ever be remembered, and is still felt by the nations of the earth.

The principal causes which contributed to the establishment of the monarchy of the Roman emperors may be reduced to the following heads: first, a simple and constitutional form of government; secondly, the discipline of the armies; thirdly, the wise policy of extending gradually the limits of the capital, and admitting into the rights of Roman citizens the most faithful and useful of the conquered nations; and fourthly, the prudent management of the finances.`,
  },
  'ch2': {
    title: 'The Governments of the Provinces',
    content: `The empire was divided into provinces, each governed by a proconsul or propraetor appointed by the emperor or senate. The provincial governors had absolute authority in their respective territories, subject only to the general laws of the empire and the control of Rome.

The administration of justice in the provinces was carefully regulated. Local magistrates administered the laws under the supervision of Roman officials. Appeals could be made to the emperor, who acted as the supreme judge. This system of governance, though sometimes subject to corruption, generally provided an effective means of controlling the vast territories of the empire.

The provinces contributed to the imperial treasury through various forms of taxation. Land taxes, customs duties, and other levies were collected by imperial officials. The revenue thus obtained was used to maintain the armies, public works, and the administration of the empire. The economic resources of the provinces were thus channeled toward the support of the imperial system.

The relationship between Rome and the provinces was complex. While Roman rule brought order, security, and the benefits of Roman civilization, it also involved the extraction of wealth and the subordination of local interests to those of Rome. Over time, the provinces developed a sense of Roman identity, and the distinction between Italy and the provinces became increasingly blurred.`,
  },
  'ch3': {
    title: 'The Systems of the Barbarians',
    content: `Beyond the frontiers of the Roman Empire existed various nations of barbarians, whose customs and systems of government differed greatly from those of Rome. These peoples possessed their own laws, forms of governance, and military organizations.

The Germanic peoples, inhabiting the forests and plains beyond the Rhine, were organized into tribes, each governed by chieftains or kings. Their society was based on kinship, and social organization was relatively simple compared to the complex hierarchy of Rome. Yet these peoples possessed considerable military prowess and organization.

The nomadic peoples of Asia, including the Huns and other horse-riding warriors, possessed military capabilities that would eventually challenge even the might of Rome. Their cavalry tactics and mobility gave them significant advantages in warfare.

The gradual pressure of these barbarian peoples upon the frontiers of Rome would eventually lead to the great migrations that transformed the political geography of Europe. The collision between the Roman and barbarian worlds would produce new societies that combined elements of both civilizations.`,
  },
  'ch4': {
    title: 'The Invasion of the Goths',
    content: `The Goths, a Germanic people of considerable martial ability, gradually moved toward the Roman frontiers in the third and fourth centuries. Pressured by the Huns from the east, they sought lands within the Roman Empire.

In the year 378, the Goths under their leader Alaric defeated the Roman army at Adrianople, a catastrophic loss that demonstrated the vulnerability of Roman military might. This battle marked a turning point in the relationship between Rome and the barbarian peoples.

Alaric, after his victory, negotiated with the Roman government, eventually settling his people in the province of Aquitania. Yet the relationship between the Gothic people and Rome remained unstable. The Goths, though partly Romanized, maintained their distinct identity and military organization.

The sack of Rome by Alaric in 410 shocked the world. For the first time in nearly eight hundred years, the capital of the empire had been taken by an enemy. Though the physical destruction was limited, the psychological impact was profound. It demonstrated that Rome was not invulnerable, that the eternal city could fall to barbarian hands.`,
  },
  'ch5': {
    title: 'The Final Years of the Western Empire',
    content: `The fall of the Western Roman Empire was not a sudden catastrophe but a gradual process extending over decades and centuries. Multiple factors contributed to this decline: economic exhaustion, military pressure from barbarian peoples, political instability, and the transformation of society brought about by the rise of Christianity.

The imperial government, facing constant military threats and fiscal crises, lost the ability to maintain effective control over all territories. Provincial governors and military commanders increasingly acted independently. The unity of the empire fractured as various barbarian kingdoms established themselves within former Roman territories.

By 476, when the Germanic chieftain Odoacer deposed the last Western Roman emperor Romulus Augustulus, the transformation was already nearly complete. What followed was not a cataclysmic collapse but the emergence of new societies that combined Roman and Germanic elements.

Yet even as political unity dissolved, the cultural legacy of Rome endured. Roman law, language, and Christianity shaped the emerging medieval civilization. The fall of Rome was thus both an ending and a beginning, the conclusion of one era and the opening of another. The study of Rome's decline teaches us profound lessons about the nature of civilization, the causes of historical change, and the fragility of even the mightiest empires.`,
  },
};

export default function ReadPage({ params }: { params: { id: string } }) {
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const chapters = [
    { id: 'ch1', number: 1, title: 'Introduction: The Extent and Military Force of the Roman Empire' },
    { id: 'ch2', number: 2, title: 'The Governments of the Provinces' },
    { id: 'ch3', number: 3, title: 'The Systems of the Barbarians' },
    { id: 'ch4', number: 4, title: 'The Invasion of the Goths' },
    { id: 'ch5', number: 5, title: 'The Final Years of the Western Empire' },
  ];

  const currentChapter = chapters[currentChapterIndex];
  const chapterContent = CHAPTERS_DATA[currentChapter.id];
  const progress = ((currentChapterIndex + 1) / chapters.length) * 100;

  const goToPreviousChapter = () => {
    if (currentChapterIndex > 0) {
      setCurrentChapterIndex(currentChapterIndex - 1);
      window.scrollTo(0, 0);
    }
  };

  const goToNextChapter = () => {
    if (currentChapterIndex < chapters.length - 1) {
      setCurrentChapterIndex(currentChapterIndex + 1);
      window.scrollTo(0, 0);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      {/* Progress Bar */}
      <div className="fixed top-16 left-0 right-0 z-40 h-1 bg-[#141414]">
        <Progress value={progress} className="h-full bg-[#27272a]" />
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-16 z-30 h-[calc(100vh-64px)] w-64 overflow-y-auto border-r border-[#27272a] bg-[#0a0a0a] transition-transform duration-300 lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4">
          <h3 className="mb-4 font-semibold text-white">Table of Contents</h3>
          <div className="space-y-2">
            {chapters.map((chapter, index) => (
              <button
                key={chapter.id}
                onClick={() => {
                  setCurrentChapterIndex(index);
                  setSidebarOpen(false);
                  window.scrollTo(0, 0);
                }}
                className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-all ${
                  currentChapterIndex === index
                    ? 'bg-violet-500/20 text-violet-400'
                    : 'text-zinc-400 hover:text-white hover:bg-[#141414]'
                }`}
              >
                <span className="text-xs text-zinc-600">Chapter {chapter.number}</span>
                <p className="line-clamp-2">{chapter.title}</p>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1">
        {/* Mobile Sidebar Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="fixed left-4 top-20 z-20 rounded-lg bg-violet-500 p-2 text-white lg:hidden"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Reading Area */}
        <article className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Chapter Title */}
          <header className="mb-12">
            <p className="mb-2 text-sm text-zinc-500">
              Chapter {currentChapter.number}
            </p>
            <h1 className="font-serif text-4xl font-bold text-white sm:text-5xl">
              {chapterContent.title}
            </h1>
          </header>

          {/* Chapter Content */}
          <div className="prose prose-invert max-w-none">
            {chapterContent.content.split('\n\n').map((paragraph, i) => (
              <p
                key={i}
                className="mb-6 text-lg leading-relaxed text-zinc-300"
              >
                {paragraph}
              </p>
            ))}
          </div>

          {/* Chapter Navigation */}
          <div className="mt-12 flex items-center justify-between border-t border-[#27272a] pt-8">
            <Button
              onClick={goToPreviousChapter}
              disabled={currentChapterIndex === 0}
              variant="outline"
              className="border-[#27272a] text-zinc-400 hover:text-white hover:bg-[#141414] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Previous Chapter
            </Button>

            <div className="text-center">
              <p className="text-sm text-zinc-500">
                Chapter {currentChapterIndex + 1} of {chapters.length}
              </p>
            </div>

            <Button
              onClick={goToNextChapter}
              disabled={currentChapterIndex === chapters.length - 1}
              className="bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next Chapter
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Ask AI Button */}
          <div className="mt-8 text-center">
            <Link href={`/book/${params.id}/chat`}>
              <Button
                variant="outline"
                className="border-violet-500/50 text-violet-400 hover:bg-violet-500/10"
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Ask AI About This Chapter
              </Button>
            </Link>
          </div>
        </article>

        {/* Floating Chat Button */}
        <Link
          href={`/book/${params.id}/chat`}
          className="fixed bottom-6 right-6 rounded-full bg-violet-500 p-4 text-white shadow-lg transition-all hover:bg-violet-600 hover:shadow-xl lg:hidden"
        >
          <MessageSquare className="h-6 w-6" />
        </Link>
      </main>
    </div>
  );
}
