import { MeetingAnalysis } from './types';

export function escapeLatex(text: string | null | undefined): string {
  if (!text) return '';
  let res = String(text);
  res = res.replace(/\\/g, '\\textbackslash{}');
  res = res.replace(/&/g, '\\&');
  res = res.replace(/%/g, '\\%');
  res = res.replace(/\$/g, '\\$');
  res = res.replace(/#/g, '\\#');
  res = res.replace(/_/g, '\\_');
  res = res.replace(/\{/g, '\\{');
  res = res.replace(/\}/g, '\\}');
  res = res.replace(/~/g, '\\textasciitilde{}');
  res = res.replace(/\^/g, '\\textasciicircum{}');
  res = res.replace(/</g, '\\textless{}');
  res = res.replace(/>/g, '\\textgreater{}');
  res = res.replace(/"([^"]*)"/g, "``$1''");
  return res;
}

export function generateXeLatex(data: MeetingAnalysis | null, defaultMeta?: any): string {
  const m = data?.meeting || defaultMeta || {};
  const university = escapeLatex(m.university || 'TRƯỜNG ĐẠI HỌC');
  const meetingId = escapeLatex(m.meeting_id || 'HT-2026-10-01');
  const time = escapeLatex(m.time || 'Chưa xác định');
  const location = escapeLatex(m.location || 'Phòng họp Ban Giám hiệu');
  const chair = escapeLatex(m.chair || 'Chưa xác định');
  const attendees = escapeLatex(m.attendees || 'Ban Giám hiệu và Trưởng các đơn vị');
  const objective = escapeLatex(m.objective || 'Chưa xác định');
  const sourcesStr = (m.sources || ['BG-01'])
    .map((s: string) => `\\texttt{${escapeLatex(s)}}`)
    .join(', ');
  const reviewer = escapeLatex(m.reviewer || '[Họ tên người rà soát]');
  const reviewDate = escapeLatex(m.review_date || 'DD/MM/YYYY');

  const keyPointsRows = (data?.key_points || [])
    .map(
      (kp) =>
        `  \\item \\textbf{${escapeLatex(kp.bold)}}: ${escapeLatex(
          kp.detail
        )} \\source{${escapeLatex(kp.source)}}`
    )
    .join('\n') || '  \\item \\textit{Chưa có dữ liệu phân tích từ file ghi âm thật.}';

  const decisionRows = (data?.decisions || [])
    .map((d) => {
      let statusColor = '\\textbf{Chưa xác định}';
      if (d.status === 'Đã kết luận') {
        statusColor = '\\textcolor{navy}{\\textbf{Đã kết luận}}';
      } else if (d.status === 'Đang đề xuất') {
        statusColor = '\\textcolor{muted}{\\textbf{Đang đề xuất}}';
      } else {
        statusColor = `\\textcolor{red!70!black}{\\textbf{${escapeLatex(d.status)}}}`;
      }
      return `  ${statusColor} & ${escapeLatex(d.content)} & ${escapeLatex(
        d.implication
      )} \\\\\n  \\midrule`;
    })
    .join('\n') || '  \\textit{Chưa xác định} & Chưa có dữ liệu ghi nhận & Chờ phân tích file âm thanh \\\\\n  \\midrule';

  const taskRows = (data?.tasks || [])
    .map(
      (t) =>
        `  ${escapeLatex(t.code)} & ${escapeLatex(t.deliverable)} & ${escapeLatex(
          t.owner
        )} & ${escapeLatex(t.deadline)} & \\small ${escapeLatex(
          t.basis
        )} \\\\\n  \\midrule`
    )
    .join('\n') || '  NV00 & Chờ phân tích & Ban Giám hiệu & Chưa xác định & Băng ghi âm cuộc họp \\\\\n  \\midrule';

  const riskRows = (data?.risks || [])
    .map(
      (r) =>
        `  ${escapeLatex(r.issue)} & ${escapeLatex(r.impact)} & ${escapeLatex(
          r.mitigation
        )} \\\\\n  \\midrule`
    )
    .join('\n') || '  Chưa có dữ liệu rủi ro & Chờ gỡ băng & Phân tích từ file âm thanh thực tế \\\\\n  \\midrule';

  const followUpRows = (data?.follow_up || [])
    .map((act) => `  \\item ${escapeLatex(act)}`)
    .join('\n') || '  \\item Đang chờ tải file âm thanh thực tế để phân tích các đầu mối theo dõi.';

  const stated = escapeLatex(
    data?.direction_signals?.stated || 'Chưa xác định định hướng xuyên suốt (chờ phân tích âm thanh).'
  );
  const disagreements = escapeLatex(
    data?.direction_signals?.disagreements ||
      'Chưa ghi nhận bất đồng đáng kể tại cuộc họp.'
  );
  const toVerify = escapeLatex(
    data?.direction_signals?.to_verify ||
      'Cần đối chiếu với quy chế đào tạo hiện hành và kế hoạch tài chính đã phê duyệt.'
  );

  const suggestionsRows = (data?.suggestions || [])
    .map((s) => `  \\item ${escapeLatex(s)}`)
    .join('\n') || '  \\item Chưa có gợi ý tham mưu do chưa tiến hành phân tích file ghi âm.';

  const verificationRows = (data?.verification || [])
    .map((v) => {
      const statusBadge =
        v.status === 'Đã rõ'
          ? '\\textcolor{green!60!black}{\\textbf{Đã rõ}}'
          : `\\textcolor{red!70!black}{\\textbf{${escapeLatex(v.status || 'Cần kiểm chứng')}}}`;
      return `  ${escapeLatex(v.item)} & ${escapeLatex(
        v.evidence
      )} & ${statusBadge} \\\\\n  \\midrule`;
    })
    .join('\n') || '  Kiểm chứng nội dung cuộc họp & Băng ghi âm thực tế & \\textbf{Cần kiểm chứng} \\\\\n  \\midrule';

  return `% !TeX program = xelatex
\\documentclass[11pt,a4paper]{article}

% Thiết lập font chữ tiếng Việt qua fontspec (XeLaTeX)
\\usepackage{fontspec}
\\defaultfontfeatures{Ligatures=TeX}
\\IfFontExistsTF{Times New Roman}{%
  \\setmainfont{Times New Roman}%
}{%
  \\IfFontExistsTF{Liberation Serif}{%
    \\setmainfont{Liberation Serif}%
  }{%
    \\setmainfont{Latin Modern Roman}%
  }%
}

% Định dạng lề trang chuẩn công văn hành chính
\\usepackage[margin=20mm,headheight=15pt,headsep=12pt,footskip=20pt]{geometry}

% Quản lý màu sắc
\\usepackage{xcolor}
\\definecolor{navy}{HTML}{17324D}
\\definecolor{light}{HTML}{EDF2F7}
\\definecolor{muted}{HTML}{536171}
\\definecolor{bordergray}{HTML}{CBD5E0}

% Tiêu đề đầu trang và chân trang
\\usepackage{fancyhdr}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\textsf{\\textbf{\\textcolor{navy}{${university}}}}}
\\fancyhead[R]{\\textcolor{muted}{\\textsf{[MẪU GIẢ ĐỊNH | ${meetingId}]}}}
\\fancyfoot[L]{\\textcolor{muted}{\\footnotesize\\textsf{Bản tham mưu nội bộ • Chưa xác nhận}}}
\\fancyfoot[R]{\\textcolor{muted}{\\footnotesize\\textsf{Trang \\thepage}}}
\\renewcommand{\\headrulewidth}{0.5pt}
\\renewcommand{\\footrulewidth}{0.5pt}

% Gói bảng biểu nâng cao
\\usepackage{tabularx}
\\usepackage{booktabs}
\\usepackage{colortbl}
\\usepackage{array}
\\usepackage{enumitem}

% Khoảng cách đoạn văn và ngắt dòng
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{5pt plus 1pt minus 1pt}

% Định nghĩa macro định dạng nguồn trích dẫn
\\newcommand{\\source}[1]{\\textcolor{muted}{\\footnotesize\\textsf{[#1]}}}

% Định nghĩa macro hộp cảnh báo / lưu ý (Notice Box)
\\newcommand{\\notice}[2]{%
  \\vspace{4pt}%
  \\noindent\\colorbox{light}{%
    \\parbox{\\dimexpr\\textwidth-2\\fboxsep\\relax}{%
      \\vspace{2pt}%
      \\small\\textbf{\\textcolor{navy}{#1:}} \\textcolor{black}{#2}%
      \\vspace{2pt}%
    }%
  }%
  \\vspace{4pt}%
}

% Định dạng tiêu đề các phần (Sections)
\\usepackage{titlesec}
\\titleformat{\\section}
  {\\normalfont\\Large\\bfseries\\color{navy}}
  {\\thesection.}{0.6em}{}
  [\\vspace{1pt}\\titlerule\\vspace{3pt}]

\\titleformat{\\subsection}
  {\\normalfont\\large\\bfseries\\color{navy}}
  {\\thesubsection}{0.5em}{}

\\begin{document}

% Tiêu đề chính của văn bản báo cáo
\\begin{center}
  {\\LARGE\\bfseries\\color{navy} BẢN THAM MƯU NỘI DUNG CUỘC HỌP BAN GIÁM HIỆU}\\\\[4pt]
  {\\large\\bfseries\\color{muted} PHỤC VỤ CÔNG TÁC ĐIỀU HÀNH CỦA HIỆU TRƯỞNG}\\\\[2pt]
  {\\small\\textit{(Tổng hợp tự động từ hệ thống Meeting Intelligence kết hợp rà soát chuyên viên)}}
\\end{center}
\\vspace{6pt}

\\notice{Mẫu minh họa}{Văn bản này được tổng hợp từ hệ thống Meeting Intelligence phục vụ công tác điều hành nội bộ của Hiệu trưởng. Các thông tin cần được rà soát đối chiếu trước khi ban hành thông báo kết luận chính thức.}

% ==============================================================================
% 1. THÔNG TIN CUỘC HỌP
% ==============================================================================
\\section{Thông tin cuộc họp}

\\begin{tabularx}{\\textwidth}{@{}>{\\bfseries\\color{navy}}p{3.8cm} X@{}}
  \\toprule
  Thời gian: & ${time} \\\\
  Địa điểm: & ${location} \\\\
  Chủ trì: & ${chair} \\\\
  Thành phần tham dự: & ${attendees} \\\\
  Mục tiêu cuộc họp: & ${objective} \\\\
  Mã nguồn dữ liệu: & ${sourcesStr} \\\\
  Người rà soát: & ${reviewer} (Ngày rà soát: ${reviewDate}) \\\\
  \\bottomrule
\\end{tabularx}

% ==============================================================================
% 2. HIỆU TRƯỞNG CẦN NẮM NGAY
% ==============================================================================
\\section{Hiệu trưởng cần nắm ngay}

\\begin{itemize}[leftmargin=1.5em, itemsep=3pt]
${keyPointsRows}
\\end{itemize}

% ==============================================================================
% 3. QUYẾT ĐỊNH, ĐỀ XUẤT VÀ VẤN ĐỀ CÒN MỞ
% ==============================================================================
\\section{Quyết định, đề xuất và vấn đề còn mở}

\\notice{Quy tắc diễn giải}{Các mục "Đã kết luận" đã được Hiệu trưởng chốt trong cuộc họp; "Đang đề xuất" là phương án chuyên môn đang xin ý kiến; "Chưa xác định" là nội dung cần rà soát lại văn bản hoặc xin ý kiến chỉ đạo bổ sung.}

\\vspace{3pt}
\\begin{tabularx}{\\textwidth}{@{}>{\\raggedright\\arraybackslash\\bfseries}p{2.8cm} >{\\raggedright\\arraybackslash}X >{\\raggedright\\arraybackslash}p{4.5cm}@{}}
  \\toprule
  \\rowcolor{light}
  \\textcolor{navy}{Trạng thái} & \\textcolor{navy}{Nội dung chi tiết} & \\textcolor{navy}{Hàm ý thực thi} \\\\
  \\midrule
${decisionRows}
  \\bottomrule
\\end{tabularx}

% ==============================================================================
% 4. BẢNG GIAO VIỆC VÀ THỜI HẠN
% ==============================================================================
\\section{Bảng giao việc và thời hạn}

\\begin{tabularx}{\\textwidth}{@{}>{\\bfseries\\centering\\arraybackslash}p{1.3cm} >{\\raggedright\\arraybackslash}X >{\\raggedright\\arraybackslash}p{3.2cm} >{\\centering\\arraybackslash}p{2.2cm} >{\\raggedright\\arraybackslash}p{3.2cm}@{}}
  \\toprule
  \\rowcolor{light}
  \\textcolor{navy}{Mã} & \\textcolor{navy}{Sản phẩm / Đầu ra} & \\textcolor{navy}{Chịu trách nhiệm} & \\textcolor{navy}{Thời hạn} & \\textcolor{navy}{Căn cứ giao việc} \\\\
  \\midrule
${taskRows}
  \\bottomrule
\\end{tabularx}

% ==============================================================================
% 5. RỦI RO, NGUỒN LỰC VÀ TÁC ĐỘNG
% ==============================================================================
\\section{Rủi ro, nguồn lực và tác động}

\\begin{tabularx}{\\textwidth}{@{}>{\\raggedright\\arraybackslash\\bfseries}p{3.6cm} >{\\raggedright\\arraybackslash}X >{\\raggedright\\arraybackslash}p{4.8cm}@{}}
  \\toprule
  \\rowcolor{light}
  \\textcolor{navy}{Vấn đề / Rủi ro} & \\textcolor{navy}{Tác động dự kiến} & \\textcolor{navy}{Phương án phòng ngừa / Giảm thiểu} \\\\
  \\midrule
${riskRows}
  \\bottomrule
\\end{tabularx}

% ==============================================================================
% 6. THEO DÕI SAU HỌP
% ==============================================================================
\\section{Theo dõi sau họp}

\\begin{itemize}[leftmargin=1.5em, itemsep=3pt]
${followUpRows}
\\end{itemize}

% ==============================================================================
% 7. ĐỊNH HƯỚNG, BẤT ĐỒNG VÀ TÍN HIỆU XU HƯỚNG
% ==============================================================================
\\section{Định hướng, bất đồng và tín hiệu xu hướng}

\\textbf{\\textcolor{navy}{7.1. Định hướng đã tuyên bố:}}
\\begin{quote}
  \\textit{ ${stated} }
\\end{quote}

\\textbf{\\textcolor{navy}{7.2. Các quan điểm bất đồng / chưa thống nhất:}}
\\begin{quote}
  \\textit{ ${disagreements} }
\\end{quote}

\\textbf{\\textcolor{navy}{7.3. Các nội dung cần xác minh đối chiếu:}}
\\begin{quote}
  \\textit{ ${toVerify} }
\\end{quote}

% ==============================================================================
% 8. GÓP Ý THAM MƯU DÀNH CHO HIỆU TRƯỞNG
% ==============================================================================
\\section{Góp ý tham mưu dành cho Hiệu trưởng}

\\notice{Phần này do hệ thống đề xuất}{Các đề xuất dưới đây được tạo ra độc lập bởi trợ lý tham mưu nhằm gợi mở các góc nhìn rủi ro và phương án chỉ đạo chiến lược; đây KHÔNG PHẢI là phát biểu hoặc kết luận của Hiệu trưởng.}

\\begin{itemize}[leftmargin=1.5em, itemsep=4pt]
${suggestionsRows}
\\end{itemize}

% ==============================================================================
% 9. KIỂM CHỨNG TRƯỚC KHI SỬ DỤNG
% ==============================================================================
\\section{Kiểm chứng trước khi sử dụng}

\\begin{tabularx}{\\textwidth}{@{}>{\\bfseries\\raggedright\\arraybackslash}p{4cm} >{\\raggedright\\arraybackslash}X >{\\centering\\arraybackslash}p{3cm}@{}}
  \\toprule
  \\rowcolor{light}
  \\textcolor{navy}{Nội dung cần kiểm chứng} & \\textcolor{navy}{Tài liệu / Căn cứ minh chứng} & \\textcolor{navy}{Trạng thái} \\\\
  \\midrule
${verificationRows}
  \\bottomrule
\\end{tabularx}

\\vspace{25pt}

% Bảng ký tên xác nhận cuối văn bản
\\noindent
\\begin{tabularx}{\\textwidth}{@{}>{\\centering\\arraybackslash}X >{\\centering\\arraybackslash}X@{}}
  \\textbf{\\textcolor{navy}{NGƯỜI RÀ SOÁT NỘI DUNG}} & \\textbf{\\textcolor{navy}{HIỆU TRƯỞNG / NGƯỜI ĐƯỢC GIAO XÁC NHẬN}} \\\\
  \\textit{(Ký và ghi rõ họ tên)} & \\textit{(Ký, phê duyệt và ban hành thông báo kết luận)} \\\\[50pt]
  \\textbf{${reviewer}} & \\textbf{${chair}} \\\\
  Ngày: ${reviewDate} & Ngày: \\ldots\\ldots / \\ldots\\ldots / 2026 \\\\
\\end{tabularx}

\\end{document}
`;
}
