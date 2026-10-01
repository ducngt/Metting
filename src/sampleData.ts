import { MeetingMetadata, TranscriptSegment } from './types';

// Thông tin khởi tạo cơ bản cho cuộc họp thực tế
export const DEFAULT_METADATA: MeetingMetadata = {
  university: 'TRƯỜNG ĐẠI HỌC',
  meeting_id: `HT-${new Date().toISOString().slice(0, 10)}`,
  title: 'Cuộc họp Ban Giám hiệu',
  time: `Ngày ${new Date().toLocaleDateString('vi-VN')}`,
  location: 'Phòng họp Ban Giám hiệu',
  chair: 'Hiệu trưởng',
  attendees: 'Ban Giám hiệu và Trưởng các đơn vị',
  objective: 'Nội dung điều hành công tác trọng tâm',
  sources: ['BG-01'],
  reviewer: 'Thư ký Tổng hợp',
  review_date: new Date().toLocaleDateString('vi-VN'),
};

// Không sử dụng dữ liệu mẫu gỡ băng - chỉ nhận dữ liệu từ file ghi âm thật
export const DEFAULT_SEGMENTS: TranscriptSegment[] = [];

// Không có dữ liệu phân tích mẫu ban đầu - phải phân tích từ file âm thanh thực
export const DEFAULT_ANALYSIS = null;
