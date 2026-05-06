import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Play, Film, Clock, X, ArrowLeft, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import ProjectEditor from '@/components/ProjectEditor';
import { downloadVideo } from '@/lib/download-video';
import { t } from '@/lib/app-language';

interface JobItem {
  jobId: string;
  topic: string;
  topicLabel: string;
  langLabel: string;
  styleLabel: string;
  format: string;
  createdAt: number;
}

interface Props {
  onBack: () => void;
  language: string;
}

const VideoHistory = ({ onBack, language }: Props) => {
  const text = t(language);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingJob, setPlayingJob] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [deletingJob, setDeletingJob] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/jobs');
      if (!resp.ok) throw new Error('Failed to load');
      const data = await resp.json();
      setJobs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === 'ru' ? 'Ошибка загрузки' : 'Loading error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (jobId: string) => {
    const confirmed = window.confirm(
      language === 'ru'
        ? 'Удалить этот проект и готовый ролик? Это действие нельзя отменить.'
        : 'Delete this project and the finished video? This cannot be undone.',
    );
    if (!confirmed) return;

    setDeletingJob(jobId);
    try {
      const resp = await fetch(`/api/job/${jobId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setJobs(prev => prev.filter(job => job.jobId !== jobId));
      if (playingJob === jobId) setPlayingJob(null);
      if (editingJob === jobId) setEditingJob(null);
      toast.success(language === 'ru' ? 'Проект удалён' : 'Project deleted');
    } catch (err) {
      toast.error(`${language === 'ru' ? 'Не удалось удалить проект' : 'Failed to delete project'}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingJob(null);
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return text.justNow;
    if (diffMin < 60) return `${diffMin} ${text.minAgo}`;
    if (diffHrs < 24) return `${diffHrs} ${text.hourAgo}`;
    return d.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 glass border-b border-border">
        <div className="container mx-auto flex items-center gap-4 h-16 px-6">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> {text.back}
          </Button>
          <h1 className="text-lg font-bold font-heading flex-1">{text.myVideos}</h1>
          <span className="text-xs text-muted-foreground">{jobs.length} {language === 'ru' ? 'видео' : 'videos'}</span>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6">
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-destructive mb-3">{error}</p>
            <Button variant="outline" onClick={fetchJobs}>{text.tryAgain}</Button>
          </div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="text-center py-20">
            <Film className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground text-lg">{text.noVideos}</p>
            <p className="text-muted-foreground text-sm mt-1">{text.createFirst}</p>
          </div>
        )}

        {!loading && !error && jobs.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <AnimatePresence>
              {jobs.map((job, i) => (
                <motion.div
                  key={job.jobId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="group relative rounded-2xl overflow-hidden border border-border bg-card hover:border-primary/40 transition-all"
                >
                  {/* Video preview */}
                  <div className="relative aspect-[9/16] bg-black cursor-pointer"
                    onClick={() => setPlayingJob(job.jobId)}
                  >
                    <video
                      src={`/api/video/${job.jobId}`}
                      className="w-full h-full object-cover"
                      preload="metadata"
                      muted
                      onMouseEnter={e => (e.target as HTMLVideoElement).play().catch(() => {})}
                      onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                    />
                    {/* Play overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Play className="w-5 h-5 text-white fill-white" />
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-sm font-medium truncate">{job.topicLabel || job.topic || (language === 'ru' ? 'Видео' : 'Video')}</p>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {formatDate(job.createdAt)}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-2 gap-1.5 text-xs"
                      onClick={() => downloadVideo(job.jobId)}
                    >
                      <Download className="w-3 h-3" /> {text.download}
                    </Button>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1.5 text-xs"
                        onClick={() => setEditingJob(job.jobId)}
                      >
                        <Pencil className="w-3 h-3" /> {text.edit}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-xs text-destructive hover:text-destructive"
                        onClick={() => handleDelete(job.jobId)}
                        disabled={deletingJob === job.jobId}
                      >
                        {deletingJob === job.jobId ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                        {text.delete}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Full-screen video player modal */}
      <AnimatePresence>
        {playingJob && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setPlayingJob(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="relative max-h-[90vh] rounded-2xl overflow-hidden border border-border"
              style={{ aspectRatio: '9/16', height: '80vh' }}
            >
              <video
                src={`/api/video/${playingJob}`}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
              <button
                onClick={() => setPlayingJob(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingJob && (
          <ProjectEditor
            jobId={editingJob}
            onClose={() => setEditingJob(null)}
            onUpdated={() => {
              fetchJobs();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default VideoHistory;
