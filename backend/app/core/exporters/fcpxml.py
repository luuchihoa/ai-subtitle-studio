from typing import List, Dict, Any
import xml.etree.ElementTree as ET
from xml.dom import minidom

def export_to_fcpxml(segments: List[Dict[str, Any]], title: str = "Subtitles", fps: int = 30) -> str:
    """
    Exports subtitle segments into Final Cut Pro XML (FCPXML) format.
    """
    fcpxml = ET.Element("fcpxml", version="1.9")
    resources = ET.SubElement(fcpxml, "resources")
    format_elem = ET.SubElement(resources, "format", id="r1", name=f"FFVideoFormat1080p{fps}", frameDuration=f"100/{fps * 100}s", width="1920", height="1080")
    
    library = ET.SubElement(fcpxml, "library")
    event = ET.SubElement(library, "event", name=title)
    project = ET.SubElement(event, "project", name=title)
    
    total_dur = max([s.get("end_time", 0.0) for s in segments] or [10.0])
    sequence = ET.SubElement(project, "sequence", format="r1", duration=f"{int(total_dur * fps)}/{fps}s")
    spine = ET.SubElement(sequence, "spine")
    
    for idx, seg in enumerate(segments):
        start_sec = seg.get("start_time", 0.0)
        end_sec = seg.get("end_time", 0.0)
        duration_sec = max(0.1, end_sec - start_sec)
        text = seg.get("text", "").replace("\n", " ")

        title_elem = ET.SubElement(
            spine,
            "title",
            name=f"Sub_{idx+1}",
            offset=f"{int(start_sec * fps)}/{fps}s",
            duration=f"{int(duration_sec * fps)}/{fps}s",
            start="0s"
        )
        text_elem = ET.SubElement(title_elem, "text")
        text_style = ET.SubElement(text_elem, "text-style", ref="ts1")
        text_style.text = text

    xml_str = ET.tostring(fcpxml, encoding="utf-8")
    dom = minidom.parseString(xml_str)
    return dom.toprettyxml(indent="  ")
