import {EventEmitter} from '@angular/core';
import {ChannelMsg, ChannelMsgType, MediaEvent, MediaStreamType} from '../entities';
import {mungeOfferInfo} from './webrtc-sdp-munge';


export class WebrtcConnection extends EventEmitter<MediaEvent> {
    private readonly pc: RTCPeerConnection;
    private dataChannel: RTCDataChannel | undefined;

    constructor(
        private readonly config: RTCConfiguration
    ) {
        super(true);
        this.pc = new RTCPeerConnection(this.config);
        this.pc.ontrack = (ev: RTCTrackEvent) => this.emit({
            mediaIndex: Number(ev.transceiver.mid),
            type: 'add',
            track: ev.track,
            parent: ev
        });
        // @TODO Later
        this.pc.onsignalingstatechange = _ => console.log('onsignalingstatechange');
        this.pc.oniceconnectionstatechange = _ => console.log('oniceconnectionstatechange');
        this.pc.onicecandidate = event => this.onicecandidate(event);
        this.pc.onnegotiationneeded = _ => console.log('onnegotiationneeded');
        this.pc.ondatachannel = (event) => {
            console.log('Receive Channel Callback');
            this.dataChannel = event.channel;
            this.dataChannel.onmessage = this.onReceiveChannelMessageCallback;
            this.dataChannel.onopen = this.onReceiveChannelStateChange;
            this.dataChannel.onclose = this.onReceiveChannelStateChange;
        };
    }

    public createDataChannel(): RTCDataChannel {
        this.dataChannel = this.pc.createDataChannel('whep');
        this.dataChannel.onmessage = this.onReceiveChannelMessageCallback;
        this.dataChannel.onopen = this.onReceiveChannelStateChange;
        this.dataChannel.onclose = this.onReceiveChannelStateChange;
        return this.dataChannel;
    }

    public createOffer(streams: Map<MediaStreamType, MediaStream>): Promise<RTCSessionDescription> {
        const trackInfo = new Map<string, MediaStreamType>();
        streams.forEach((ms, streamType) => {
            let streamId = ms.id;
            ms.getTracks().forEach((track) => {
                this.pc.addTrack(track, ms);
                trackInfo.set(`${streamId} ${track.id}`.trim(), streamType);
            });
        });

        // @ts-ignore
        return this.pc.createOffer()
            .then((offer) => this.pc.setLocalDescription(offer))
            .then(_ => mungeOfferInfo(this.pc.localDescription as RTCSessionDescription, trackInfo));
    }

    // Ice Gathering ----------------------------
    private onicecandidate(event: RTCPeerConnectionIceEvent): void {
        if (event.candidate !== null) {
            // send ice to sfu
        } else {
            return;
        }
    }

    public setAnswer(answer: RTCSessionDescription): Promise<void> {
        console.log('Answer:', answer);
        return this.pc.setRemoteDescription(answer);
    }

    setRemoteOffer(offer: RTCSessionDescription) {
        let aw: RTCSessionDescriptionInit;
        return this.pc.setRemoteDescription(offer)
            .then(() => this.pc.createAnswer())
            .then((answer) => aw = answer)
            .then((_) => this.pc.setLocalDescription(aw))
            .then(() => aw);
    }


    public close(): Promise<void> {
        this.pc.ontrack = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.onconnectionstatechange = null;
        this.pc.onsignalingstatechange = null;
        this.pc.onicecandidate = null;
        this.pc.onnegotiationneeded = null;
        return new Promise<void>((resolve) => {
            this.pc.close();
            resolve();
        });
    }

    private onReceiveChannelMessageCallback(me: MessageEvent<any>): void {
        const msg = JSON.parse(new TextDecoder().decode(me.data as ArrayBuffer)) as ChannelMsg;
        if (msg?.type === ChannelMsgType.OfferMsg) {

        }
    }

    private onReceiveChannelStateChange(ev: Event): void {
        console.log('onReceiveChannelStateChange', ev);
    }

    private onSignalStateChange() {
        console.log(`signal state: ${this.pc.signalingState}`);

        if (this.pc.signalingState === 'have-remote-offer') {
            this.onRemoteOffer();
        }
    }

    private onRemoteOffer() {
        // SDPParser.parse(this.peerConnection.remoteDescription);
    }

}
