// @ts-nocheck
// =========================
// 📅 EPG TIMELINE (UI)
// =========================
import React, { useState, useMemo } from 'react';
import { useChannelsEPG } from './epg.hooks';
import { useChannels } from '@/features/tv/tv.hooks';
import { formatEPGTime, formatEPGDate, getCurrentProgram } from './epg.api';
import { StalkerClient } from '@/lib/stalkerAPI_new';
import { StalkerChannel, StalkerEPG } from '@/types';

interface EPGTimelineProps {
  client: StalkerClient;
  accountId: string;
  onChannelSelect: (channel: StalkerChannel) => void;
}

export const EPGTimeline: React.FC<EPGTimelineProps> = ({ 
  client, 
  accountId, 
  onChannelSelect 
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewHours, setViewHours] = useState(6);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const { data: channels = [] } = useChannels(client, accountId);
  const { data: channelsEPG, isLoading, error } = useChannelsEPG(client, channels, viewHours);

  // Update current time every minute
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const timeSlots = useMemo(() => {
    const slots = [];
    const startHour = 0;
    for (let i = 0; i < 24; i += viewHours) {
      const date = new Date(selectedDate);
      date.setHours(startHour + i, 0, 0, 0);
      slots.push(date);
    }
    return slots;
  }, [selectedDate, viewHours]);

  const visibleTimeRange = useMemo(() => {
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(24, 0, 0, 0);
    return { start, end };
  }, [selectedDate]);

  const calculateProgramPosition = (program: StalkerEPG, channelHeight: number) => {
    const startTime = Number.parseInt(program.start_time) * 1000;
    const endTime = Number.parseInt(program.end_time) * 1000;
    const dayStart = visibleTimeRange.start.getTime();
    const dayEnd = visibleTimeRange.end.getTime();
    
    const left = ((startTime - dayStart) / (dayEnd - dayStart)) * 100;
    const width = ((endTime - startTime) / (dayEnd - dayStart)) * 100;
    
    return { left: `${Math.max(0, left)}%`, width: `${Math.min(width, 100 - left)}%` };
  };

  const isProgramCurrent = (program: StalkerEPG) => {
    const now = currentTime / 1000;
    const startTime = Number.parseInt(program.start_time);
    const endTime = Number.parseInt(program.end_time);
    return startTime <= now && endTime > now;
  };

  const handleDateChange = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-lg">Loading EPG...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-lg text-red-500">Error loading EPG</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Electronic Program Guide</h2>
          
          {/* Date Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDateChange(-1)}
              className="p-2 hover:bg-gray-200 rounded"
            >
              ←
            </button>
            <span className="font-medium">
              {formatEPGDate(selectedDate.getTime() / 1000)}
            </span>
            <button
              onClick={() => handleDateChange(1)}
              className="p-2 hover:bg-gray-200 rounded"
            >
              →
            </button>
            <button
              onClick={() => setSelectedDate(new Date())}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
            >
              Today
            </button>
          </div>
        </div>

        {/* View Controls */}
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <span>View:</span>
            <select
              value={viewHours}
              onChange={(e) => setViewHours(Number(e.target.value))}
              className="border rounded px-2 py-1"
            >
              <option value={2}>2 hours</option>
              <option value={4}>4 hours</option>
              <option value={6}>6 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
            </select>
          </label>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-auto">
        <div className="relative min-w-full">
          {/* Time Header */}
          <div className="sticky top-0 z-20 bg-white border-b">
            <div className="flex">
              <div className="w-48 p-2 border-r font-medium">Channel</div>
              <div className="flex-1 flex">
                {timeSlots.map((time, index) => (
                  <div
                    key={index}
                    className="flex-1 text-center p-2 border-r text-sm"
                  >
                    {formatEPGTime(time.getTime() / 1000)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Channels and Programs */}
          <div className="relative">
            {channels.slice(0, 20).map((channel: StalkerChannel, channelIndex) => {
              const channelEPG = channelsEPG?.[Number.parseInt(channel.id)] || [];
              const currentProgram = getCurrentProgram(channelEPG);
              
              return (
                <div
                  key={channel.id}
                  className="flex border-b hover:bg-gray-50"
                  style={{ minHeight: '80px' }}
                >
                  {/* Channel Info */}
                  <div 
                    className="w-48 p-2 border-r flex items-center gap-2 cursor-pointer"
                    onClick={() => onChannelSelect(channel)}
                  >
                    {channel.logo && (
                      <img 
                        src={channel.logo} 
                        alt={channel.name}
                        className="w-8 h-8 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{channel.name}</div>
                      {currentProgram && (
                        <div className="text-xs text-gray-600 truncate">
                          {currentProgram.name}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Programs Timeline */}
                  <div className="flex-1 relative">
                    {channelEPG.map((program: StalkerEPG, programIndex) => {
                      const position = calculateProgramPosition(program, 80);
                      const isCurrent = isProgramCurrent(program);
                      
                      return (
                        <div
                          key={programIndex}
                          className={`absolute top-1 bottom-1 p-1 rounded cursor-pointer transition-colors ${
                            isCurrent 
                              ? 'bg-blue-500 text-white z-10' 
                              : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                          style={{
                            left: position.left,
                            width: position.width,
                            minWidth: '60px',
                          }}
                          title={`${program.name}\n${formatEPGTime(program.start_time)} - ${formatEPGTime(program.end_time)}`}
                        >
                          <div className="text-xs font-medium truncate">
                            {program.name}
                          </div>
                          {isCurrent && (
                            <div className="text-xs opacity-90">
                              {formatEPGTime(program.start_time)} - {formatEPGTime(program.end_time)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Current Time Indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30"
            style={{
              left: `${((currentTime - visibleTimeRange.start.getTime()) / (visibleTimeRange.end.getTime() - visibleTimeRange.start.getTime())) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
